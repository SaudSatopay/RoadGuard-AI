// Keeps one broken widget (a map that can't load tiles, a malformed detection) from blanking the whole screen.
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== "undefined") console.warn(`[RoadGuard] ${this.props.name || "widget"} failed`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" className={`border border-dashed border-line-strong px-4 py-6 ${this.props.className || ""}`}>
        <p className="font-medium">{this.props.title || "This part didn't load"}</p>
        <p className="mt-1 text-sm text-ink-2">The rest of the page still works. Reload to try again.</p>
        <button type="button" onClick={() => this.setState({ error: null })}
          className="mt-3 h-9 rounded-sm border border-line-strong bg-sheet px-3 text-sm hover:border-ink">
          Try again
        </button>
      </div>
    );
  }
}
