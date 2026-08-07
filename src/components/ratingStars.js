import { icon } from '../utils/icons.js';

export function createRatingStars(options = {}) {
  const {
    rating = 0,
    interactive = false,
    size = 24,
    onRate = () => {}
  } = options;

  const container = document.createElement('div');
  container.className = 'rating-stars-container';
  Object.assign(container.style, {
    display: 'inline-flex',
    gap: '4px',
    alignItems: 'center'
  });

  let currentRating = rating;
  let hoverRating = 0;
  const stars = [];

  const updateStars = (val) => {
    stars.forEach((star, index) => {
      const starValue = index + 1;
      star.style.transform = 'scale(1)';
      
      if (val >= starValue) {
        // Full star
        star.innerHTML = icon('star', { size, fill: 'var(--accent-primary, #FFC107)' });
        star.style.color = 'var(--accent-primary, #FFC107)';
      } else if (val >= starValue - 0.5) {
        // Half star (approximate with SVG gradient or specific icon if available)
        // Since standard lucide 'star-half' might not be in utils, we simulate it
        star.innerHTML = icon('star-half', { size, fill: 'var(--accent-primary, #FFC107)' });
        star.style.color = 'var(--accent-primary, #FFC107)';
      } else {
        // Empty star
        star.innerHTML = icon('star', { size, fill: 'none' });
        star.style.color = 'var(--text-secondary, #94A3B8)';
      }
    });
  };

  for (let i = 1; i <= 5; i++) {
    const starBtn = document.createElement('div');
    Object.assign(starBtn.style, {
      cursor: interactive ? 'pointer' : 'default',
      transition: 'transform 0.2s ease, color 0.2s',
      display: 'flex'
    });

    stars.push(starBtn);
    container.appendChild(starBtn);

    if (interactive) {
      starBtn.addEventListener('mouseenter', () => {
        hoverRating = i;
        updateStars(hoverRating);
        starBtn.style.transform = 'scale(1.2)';
      });

      starBtn.addEventListener('mouseleave', () => {
        hoverRating = 0;
        updateStars(currentRating);
      });

      starBtn.addEventListener('click', () => {
        currentRating = i;
        updateStars(currentRating);
        // Haptic pop
        starBtn.style.transform = 'scale(0.9)';
        setTimeout(() => starBtn.style.transform = 'scale(1)', 100);
        onRate(currentRating);
      });
    }
  }

  updateStars(currentRating);

  // Return DOM element
  return container;
}
