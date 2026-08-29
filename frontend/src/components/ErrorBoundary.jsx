import { Component } from 'react'

// ── When Firmo itself breaks ────────────────────────────────────────────────
//
// Without this, a crash in any component unmounts the entire tree and leaves a
// white page. That is the worst failure the product has: it looks identical to
// a hang, to a bad connection, and to work having been lost, so the honest
// reaction to it is to assume the paper is gone. It has happened twice, both
// times from a store selector building a new array on every render until React
// gave up — and both times the work was completely intact behind the white.
//
// So the boundary exists to say that. The message leads with the one fact that
// decides what the person does next: the writing is still on the device. A
// reload is almost always enough, because a render loop dies with the render
// that started it.
//
// It deliberately does not try to be clever about recovery. Re-rendering the
// subtree that just threw is how you get a crash loop, and clearing state to
// "fix" it would destroy the very thing this screen is promising is safe.

export default class ErrorBoundary extends Component {
  state = { error: null, showDetail: false }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept for whoever is looking at a console. The boundary swallows the
    // error to keep the page up, and a swallowed error with no trace anywhere
    // is how a reproducible bug becomes an unreproducible one.
    console.error('[Firmo crashed]', error, info?.componentStack)
  }

  render() {
    const { error, showDetail } = this.state
    if (!error) return this.props.children

    return (
      <div className="h-full w-full flex items-center justify-center bg-app text-t1 p-6">
        <div className="max-w-[46ch] flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Firmo stopped drawing this screen.</p>
            <p className="text-xs text-t2 leading-relaxed">
              Your sources and your writing are still saved on this device. Nothing
              here was sent anywhere, and nothing was lost — the page failed to
              draw, which is a different thing from the work going missing.
            </p>
            <p className="text-xs text-t2 leading-relaxed">
              Reloading fixes almost every version of this.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => window.location.reload()} className="btn-primary text-xs">
              Reload Firmo
            </button>
            <button
              onClick={() => this.setState(s => ({ showDetail: !s.showDetail }))}
              className="text-[11.5px] font-medium text-t3 hover:text-t1 transition-colors"
            >
              {showDetail ? 'Hide the details' : 'What went wrong?'}
            </button>
          </div>

          {showDetail && (
            <pre
              className="text-[10.5px] leading-relaxed text-t3 bg-panel border border-line
                rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap"
            >
              {String(error?.stack || error?.message || error)}
            </pre>
          )}

          <p className="text-[11px] text-t3 leading-relaxed">
            If it happens again on the same screen, that detail is the useful thing
            to send us.
          </p>
        </div>
      </div>
    )
  }
}
