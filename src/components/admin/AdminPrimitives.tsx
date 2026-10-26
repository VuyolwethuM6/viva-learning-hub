import { humanStatus } from "@/lib/admin-format";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
let scrollLocks = 0;
let previousOverflow = "";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/admin"
      className={`admin-brand ${compact ? "compact" : ""}`}
      aria-label="Viva Tutorials admin home"
    >
      <img src="/viva-tutorials-logo.png" alt="Viva Tutorials" />
      <span>Admin</span>
    </a>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`admin-badge badge-${value.replaceAll(" ", "_")}`}>
      <i aria-hidden="true" />
      {humanStatus(value)}
    </span>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="admin-avatar" aria-hidden="true">
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-empty">
      <span className="empty-icon">
        <AlertCircle size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Dialog({
  title,
  close,
  children,
  variant = "sheet",
  subtitle,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  variant?: "sheet" | "drawer" | "viewer" | "confirm";
  subtitle?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const origin = document.activeElement as HTMLElement | null;
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      origin?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`admin-modal modal-${variant}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            (e.clientX < b.left ||
              e.clientX > b.right ||
              e.clientY < b.top ||
              e.clientY > b.bottom) &&
            !busy
          )
            close();
        }
      }}
    >
      <header className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={`Close ${variant === "viewer" ? "document" : variant === "confirm" ? "confirmation" : "details"}`}
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function ConfirmAction({
  title,
  description,
  label,
  confirm,
  close,
  busy,
  error,
  danger = false,
}: {
  title: string;
  description: ReactNode;
  label: string;
  confirm: () => void;
  close: () => void;
  busy: boolean;
  error: string;
  danger?: boolean;
}) {
  return (
    <Dialog variant="confirm" title={title} close={close} busy={busy}>
      <div className={`confirm-icon ${danger ? "danger" : ""}`}>
        <AlertCircle size={30} />
      </div>
      <div className="confirm-description">{description}</div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className="confirm-actions">
        <button
          className={danger ? "admin-danger" : "admin-primary"}
          disabled={busy}
          onClick={confirm}
        >
          {busy ? (
            <>
              <Loader2 className="spin" size={18} />
              Saving…
            </>
          ) : (
            label
          )}
        </button>
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
export type ViewedDocument = {
  title: string;
  url: string;
  mime: string;
  filename: string;
  downloadUrl?: string;
  refresh?: () => Promise<ViewedDocument>;
  expiresAt?: number;
};
export function DocumentViewer({
  document: initial,
  close,
}: {
  document: ViewedDocument;
  close: () => void;
}) {
  const [document, setDocument] = useState(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!document.expiresAt) return;
    const timeout = window.setTimeout(
      () => setExpired(true),
      Math.max(0, document.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [document]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 10000);
    return () => window.clearTimeout(timeout);
  }, [document]);
  const isImage = document.mime.startsWith("image/");
  return (
    <Dialog
      title={document.title}
      subtitle="Private document viewer"
      close={close}
      variant="viewer"
    >
      <div className="viewer-toolbar">
        <a
          className="admin-button"
          href={document.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} />
          Open separately
        </a>
        <a
          className="admin-button"
          href={document.downloadUrl || document.url}
          download={document.filename}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArrowDownToLine size={16} />
          Download
        </a>
        {document.refresh && (
          <button
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setError("");
              try {
                setDocument(await document.refresh!());
                setExpired(false);
                setLoading(true);
              } catch {
                setError(
                  "The private link could not be refreshed. Close this viewer and try again.",
                );
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            Refresh private link
          </button>
        )}
      </div>
      {(expired || error) && (
        <p role="alert" className="admin-error">
          {error ||
            "This private link has expired for new requests. Refresh it before reopening or downloading."}
        </p>
      )}
      <div className="document-canvas">
        {loading && (
          <p className="viewer-loading" role="status">
            <Loader2 className="spin" size={20} />
            Loading document…
          </p>
        )}
        {isImage ? (
          <img
            src={document.url}
            alt={document.title}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(
                "The image could not load. Refresh its private link or open it separately.",
              );
            }}
          />
        ) : (
          <iframe
            title={document.title}
            src={document.url}
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(
                "Preview is unavailable. Try opening the document separately.",
              );
            }}
          />
        )}
      </div>
      <p className="admin-muted viewer-help">
        If your browser cannot display a PDF here, use Open separately or
        Download. Closing this viewer returns you to the same record.
      </p>
    </Dialog>
  );
}
