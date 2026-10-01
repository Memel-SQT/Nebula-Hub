import { render } from '@testing-library/react';
import { Icon, ICON_NAMES } from './Icon';

const STORE_ICONS = ['store', 'grid', 'link', 'puzzle', 'package', 'update', 'repair', 'uninstall', 'tray', 'bell', 'pause', 'external'] as const;

describe('Icon', () => {
  it.each(ICON_NAMES)('renders %s on the 24 px grid in currentColor, hidden from assistive tech', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.children.length).toBeGreaterThan(0);
  });

  it.each(STORE_ICONS)('draws the Store icon %s with one duotone shape', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelectorAll('.icon-duo').length).toBeGreaterThanOrEqual(1);
  });
});
