import { createDemo } from './demo';
import './style.css';

const logs = document.querySelector<HTMLOListElement>('#logs')!;
const labels: Record<string, string> = { closed: '接続なし', opening: '接続中', open: '接続成功', recovering: '再接続中' };
const demo = createDemo((entry) => {
  const follow = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  const row = document.createElement('li');
  row.className = `log-${entry.type}`;
  row.dataset.client = entry.client;
  const time = document.createElement('time');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString('ja-JP', { hour12: false }) + `.${String(now.getMilliseconds()).padStart(3, '0')}`;
  const client = document.createElement('b');
  client.textContent = entry.client;
  const text = document.createElement('span');
  text.textContent = entry.text;
  row.append(time, client, text);
  logs.append(row);
  if (follow) row.scrollIntoView({ block: 'end' });
}, (client, phase) => {
  document.querySelector(`#status-${client.toLowerCase()}`)!.textContent = labels[phase] ?? phase;
});
document.querySelector('#drop')!.addEventListener('click', () => demo.drop());
void demo.start();
if (import.meta.hot) import.meta.hot.dispose(() => { void demo.close(); });
