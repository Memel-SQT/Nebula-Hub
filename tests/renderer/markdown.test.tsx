import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Markdown } from '../../src/renderer/components/Markdown';

function renderNotes(source: string) {
  const open = jest.fn();
  const { container } = render(<Markdown source={source} onOpenLink={open} />);
  return { open, container };
}

describe('Markdown (R12)', () => {
  it('renders the usual release-note structure', () => {
    const { container } = renderNotes('## Nouveautés\n\n- **Icônes** redessinées\n- Calendrier des `achats`\n\n1. un\n2. deux\n\n> citation\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(screen.getByRole('heading', { level: 4, name: 'Nouveautés' })).toBeInTheDocument();
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('strong')).toHaveTextContent('Icônes');
    expect(container.querySelector('code')).toHaveTextContent('achats');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('blockquote')).toHaveTextContent('citation');
    expect(container.querySelector('table td')).toHaveTextContent('1');
  });

  it('never puts remote HTML into the DOM', () => {
    const { container } = renderNotes('Avant <script>window.pwned = true</script> <img src=x onerror="alert(1)"> après\n\n<div onclick="x()">bloc</div>\n\n<iframe src="https://evil.example"></iframe>');
    expect(container.querySelector('script, img, iframe, div[onclick]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror|onclick|<script|<iframe/i);
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it('opens only https links, through the callback', async () => {
    const { open } = renderNotes('[Release](https://github.com/Memel-SQT/Nebula-Finterest/releases) [mal](javascript:alert(1)) [fichier](file:///C:/x) https://github.com/compare/v1...v2');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Release', 'https://github.com/compare/v1...v2']);
    await userEvent.click(buttons[0]);
    expect(open).toHaveBeenCalledWith('https://github.com/Memel-SQT/Nebula-Finterest/releases');
    expect(screen.getByText(/mal/)).toBeInTheDocument();
  });

  it('shows images as their alt text without loading them', () => {
    const { container } = renderNotes('![capture du calendrier](https://evil.example/tracker.png)');
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('capture du calendrier');
  });

  it('drops a leading heading that repeats the release title', () => {
    render(<Markdown source={'# Nebula Finterest v0.1.36\n\n## Nouveautés\n- a'} title="Nebula Finterest v0.1.36" onOpenLink={jest.fn()} />);
    expect(screen.queryByRole('heading', { name: 'Nebula Finterest v0.1.36' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Nouveautés' })).toBeInTheDocument();
  });

  it('survives empty and pathological input', () => {
    expect(() => renderNotes('')).not.toThrow();
    expect(() => renderNotes('>'.repeat(500) + ' deep')).not.toThrow();
  });
});
