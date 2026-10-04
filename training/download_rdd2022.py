"""
Download selected country subsets of RDD2022 without fetching the whole 13 GB archive.

RDD2022 (CRDDC'2022) is published on figshare as one stored (uncompressed) zip that
contains one inner zip per country. This script reads the archive's central
directory over HTTP range requests and downloads only the inner zips you ask for.

    python training/download_rdd2022.py                      # India Japan Czech United_States China_MotorBike
    python training/download_rdd2022.py India Japan          # just these

Dataset: Arya et al., "RDD2022: A multi-national image dataset for automatic road
damage detection", CC BY 4.0, https://doi.org/10.6084/m9.figshare.21431547
"""

import struct
import sys
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ARCHIVE = "https://ndownloader.figshare.com/files/38030910"
OUT_DIR = Path(__file__).parent / "data" / "raw"
DEFAULT = ["India", "Japan", "Czech", "United_States", "China_MotorBike"]
CHUNK = 32 * 1024 * 1024
WORKERS = 6


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _signed_url() -> str:
    # figshare redirects to an S3 URL that is only valid for ~10 s, so resolve it per request.
    try:
        urllib.request.build_opener(_NoRedirect).open(ARCHIVE)
    except urllib.error.HTTPError as err:
        return err.headers["Location"]
    raise RuntimeError("figshare did not redirect to a signed URL")


def _get(start: int, end: int, retries: int = 5) -> bytes:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(_signed_url(), headers={"Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) == end - start + 1:
                return data
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"range {start}-{end} failed after {retries} attempts")


def _total_size() -> int:
    req = urllib.request.Request(_signed_url(), headers={"Range": "bytes=0-0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return int(resp.headers["Content-Range"].split("/")[1])


def list_members() -> dict:
    """Return {name: (local_header_offset, compressed_size)} from the zip64 central directory."""
    total = _total_size()
    tail = _get(total - 65536, total - 1)
    loc = tail.rfind(b"PK\x06\x07")
    _, _, z64_off, _ = struct.unpack("<IIQI", tail[loc:loc + 20])
    base = total - len(tail)
    rec = tail[z64_off - base:z64_off - base + 56]
    *_, cd_size, cd_off = struct.unpack("<IQHHIIQQQQ", rec)
    cd = _get(cd_off, cd_off + cd_size - 1)

    members, p = {}, 0
    while cd[p:p + 4] == b"PK\x01\x02":
        fields = struct.unpack("<IHHHHHHIIIHHHHHII", cd[p:p + 46])
        csize, usize, nlen, xlen, clen, lho = fields[8], fields[9], fields[10], fields[11], fields[12], fields[16]
        name = cd[p + 46:p + 46 + nlen].decode()
        extra = cd[p + 46 + nlen:p + 46 + nlen + xlen]
        q = 0
        while q < len(extra):
            hid, hsz = struct.unpack("<HH", extra[q:q + 4])
            if hid == 1:  # zip64 extended information
                vals, k = extra[q + 4:q + 4 + hsz], 0
                if usize == 0xFFFFFFFF:
                    usize = struct.unpack("<Q", vals[k:k + 8])[0]; k += 8
                if csize == 0xFFFFFFFF:
                    csize = struct.unpack("<Q", vals[k:k + 8])[0]; k += 8
                if lho == 0xFFFFFFFF:
                    lho = struct.unpack("<Q", vals[k:k + 8])[0]
            q += 4 + hsz
        members[name] = (lho, csize)
        p += 46 + nlen + xlen + clen
    return members


def download_member(name: str, lho: int, csize: int, dest: Path) -> None:
    header = _get(lho, lho + 29)
    nlen, xlen = struct.unpack("<HH", header[26:30])
    start = lho + 30 + nlen + xlen
    end = start + csize - 1

    ranges = [(s, min(s + CHUNK - 1, end)) for s in range(start, end + 1, CHUNK)]
    part = dest.with_suffix(".part")
    with open(part, "wb") as fh:
        fh.truncate(csize)
    done = [0]
    t0 = time.time()

    def fetch(rng):
        s, e = rng
        data = _get(s, e)
        with open(part, "r+b") as fh:
            fh.seek(s - start)
            fh.write(data)
        done[0] += len(data)
        mb = done[0] / 1e6
        print(f"  {dest.name}: {mb:7.1f} / {csize / 1e6:.1f} MB  ({mb / max(time.time() - t0, 1e-3):.1f} MB/s)", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(fetch, ranges))
    part.replace(dest)
    with zipfile.ZipFile(dest) as zf:  # integrity check
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f"{dest.name}: corrupt member {bad}")


def main(countries: list[str]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    members = list_members()
    for country in countries:
        name = f"RDD2022/{country}.zip"
        if name not in members:
            print(f"skip {country}: not in archive ({', '.join(sorted(members))})")
            continue
        dest = OUT_DIR / f"{country}.zip"
        if dest.exists() and dest.stat().st_size == members[name][1]:
            print(f"{country}: already downloaded")
            continue
        print(f"{country}: {members[name][1] / 1e6:.0f} MB")
        download_member(name, *members[name], dest)
        print(f"{country}: done -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT)
