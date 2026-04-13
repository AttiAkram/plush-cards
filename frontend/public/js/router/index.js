/**
 * Screen router — shows / hides the four main screens with a CSS transition.
 *
 * Each screen element has class `.screen`.
 * The active screen gets class `.active` which triggers the CSS fade-in.
 */

let _current = 'auth';

/**
 * Transition to a named screen.
 * @param {'auth'|'lobby'|'room'|'game'} name
 */
export function showScreen(name) {
  const prev = document.querySelector('.screen.active');
  const next = document.getElementById('screen-' + name);

  if (!next || prev === next) return;

  // Fade out previous
  if (prev) {
    prev.classList.remove('active');
    // Hide after transition so it doesn't block pointer events
    setTimeout(() => {
      if (!prev.classList.contains('active')) prev.style.display = 'none';
    }, 400);
  }

  // Fade in next
  next.style.display = 'flex';
  // rAF lets the browser register the display change before adding 'active'
  requestAnimationFrame(() => next.classList.add('active'));

  _current = name;
}

/** @returns {string} Name of the currently visible screen. */
export function getCurrentScreen() { return _current; }
