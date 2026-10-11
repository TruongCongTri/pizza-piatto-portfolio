import "./StatusPage.css";

export default function StatusPage({ code, title, message, children }) {
  return (
    <section className="status-page">
      <div className="container">
        <p className="mono status-page-code">Error {code}</p>
        <h1>{code}</h1>
        <h3>{title}</h3>
        <p className="md status-page-message">{message}</p>
        {children && <div className="status-page-actions">{children}</div>}
      </div>
    </section>
  );
}
