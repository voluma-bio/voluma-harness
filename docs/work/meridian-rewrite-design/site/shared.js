// Theme toggle
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  if (window.renderMermaid) renderMermaid();
}

// Apply saved theme or system preference
if (localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

// Mermaid rendering
async function renderMermaid() {
  if (typeof mermaid === 'undefined') return;
  const isDark = document.documentElement.classList.contains('dark');
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    flowchart: { curve: 'basis', nodeSpacing: 50, rankSpacing: 60 },
  });
  // Reset rendered diagrams for re-render
  document.querySelectorAll('.mermaid[data-processed]').forEach(el => {
    el.removeAttribute('data-processed');
    el.innerHTML = el.getAttribute('data-original');
  });
  await mermaid.run({ querySelector: '.mermaid' });
}

// Store originals and initial render
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mermaid').forEach(el => {
    el.setAttribute('data-original', el.innerHTML);
  });
  renderMermaid();

  // Active nav highlighting
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.topbar-nav a').forEach(a => {
    if (a.getAttribute('href') === currentPage) {
      a.classList.add('active');
    }
  });
});
