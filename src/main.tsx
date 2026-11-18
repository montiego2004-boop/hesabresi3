import '@fontsource-variable/vazirmatn';
import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { Loading } from './App';
import { initialize } from './core/db';
import './styles.css';
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Failure /> : this.props.children;
  }
}
function Failure() {
  return (
    <main className="loading">
      <h1>دفتر محلی باز نشد</h1>
      <p>
        {!window.isSecureContext
          ? 'برای استفاده از دفتر آفلاین، برنامه را از نشانی امن HTTPS باز کنید.'
          : 'دسترسی به فضای ذخیره‌سازی مرورگر را بررسی کنید. داده‌ها را پاک نکنید.'}
      </p>
      <button className="btn primary" onClick={() => location.reload()}>
        تلاش دوباره
      </button>
    </main>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Loading />);
if (!window.isSecureContext || !crypto.subtle) root.render(<Failure />);
else
  initialize()
    .then(() =>
      root.render(
        <Boundary>
          <App />
        </Boundary>,
      ),
    )
    .catch(() => root.render(<Failure />));
