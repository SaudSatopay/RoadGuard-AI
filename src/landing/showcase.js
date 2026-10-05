// Thumbnails stay JPEG (2 KB each) while the full photos are WebP, so derive the path from the file name.
export const thumbSrc = (item) => `/showcase/thumbs/${item.file.replace(/\.\w+$/, ".jpg")}`;
