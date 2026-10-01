import { Fragment, useMemo, type ReactNode } from 'react';
import { Lexer, type Token, type Tokens } from 'marked';
import { isSafeExternalUrl } from '@shared/url';

/**
 * Release notes renderer (rule R12, ADR-005). `marked` is used as a lexer only: its tokens are
 * turned into React elements here, so remote HTML never reaches the DOM — `html` tokens are
 * dropped, images are reduced to their alt text (no remote loading, CSP), and links are buttons
 * that go through the main process (`openExternal`, https: only). Nothing to sanitize because
 * nothing unsafe is ever produced.
 */
const MAX_DEPTH = 8;

const comparable = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, '');

/** `title`: when the notes open with a heading that repeats it (common in GitHub releases), it is dropped. */
export function Markdown({ source, onOpenLink, title }: { source: string; onOpenLink: (url: string) => void; title?: string }) {
  const tokens = useMemo(() => {
    let lexed: Token[];
    try {
      lexed = new Lexer({ gfm: true, breaks: false }).lex(source.slice(0, 64 * 1024));
    } catch {
      return [];
    }
    const first = lexed.findIndex((token) => token.type !== 'space');
    if (title && first >= 0 && lexed[first].type === 'heading' && comparable((lexed[first] as Tokens.Heading).text) === comparable(title)) {
      return lexed.filter((_token, index) => index !== first);
    }
    return lexed;
  }, [source, title]);
  return <div className="markdown">{renderBlocks(tokens, onOpenLink, 0)}</div>;
}

function renderBlocks(tokens: Token[], open: (url: string) => void, depth: number): ReactNode {
  if (depth > MAX_DEPTH) return null;
  return tokens.map((token, index) => <Fragment key={index}>{renderBlock(token, open, depth)}</Fragment>);
}

function renderBlock(token: Token, open: (url: string) => void, depth: number): ReactNode {
  switch (token.type) {
    case 'heading': {
      const heading = token as Tokens.Heading;
      // Release notes sit under the page's own headings: shift them down, cap at h6.
      const Tag = `h${Math.min(6, heading.depth + 2)}` as 'h3';
      return <Tag>{renderInline(heading.tokens, open, depth)}</Tag>;
    }
    case 'paragraph':
      return <p>{renderInline((token as Tokens.Paragraph).tokens, open, depth)}</p>;
    case 'text': {
      const text = token as Tokens.Text;
      return text.tokens ? <p>{renderInline(text.tokens, open, depth)}</p> : <p>{text.text}</p>;
    }
    case 'list': {
      const list = token as Tokens.List;
      const items = list.items.map((item, index) => (
        <li key={index}>
          {item.task ? <span className="md-task" aria-hidden="true">{item.checked ? '[x] ' : '[ ] '}</span> : null}
          {renderListItem(item, open, depth + 1)}
        </li>
      ));
      return list.ordered ? <ol start={typeof list.start === 'number' ? list.start : undefined}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'blockquote':
      return <blockquote>{renderBlocks((token as Tokens.Blockquote).tokens, open, depth + 1)}</blockquote>;
    case 'code':
      return <pre><code>{(token as Tokens.Code).text}</code></pre>;
    case 'hr':
      return <hr />;
    case 'table': {
      const table = token as Tokens.Table;
      return (
        <div className="md-table">
          <table>
            <thead><tr>{table.header.map((cell, index) => <th key={index}>{renderInline(cell.tokens, open, depth)}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{renderInline(cell.tokens, open, depth)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'space':
    case 'html':
    case 'def':
      return null;
    default:
      return 'text' in token && typeof token.text === 'string' ? <p>{token.text}</p> : null;
  }
}

/** List items hold "text" blocks whose inline tokens must not be wrapped in an extra <p>. */
function renderListItem(item: Tokens.ListItem, open: (url: string) => void, depth: number): ReactNode {
  return item.tokens.map((child, index) => {
    if (child.type === 'text') {
      const text = child as Tokens.Text;
      return <Fragment key={index}>{text.tokens ? renderInline(text.tokens, open, depth) : text.text}</Fragment>;
    }
    return <Fragment key={index}>{renderBlock(child, open, depth)}</Fragment>;
  });
}

function renderInline(tokens: Token[] | undefined, open: (url: string) => void, depth: number): ReactNode {
  if (!tokens || depth > MAX_DEPTH) return null;
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'text':
      case 'escape': {
        const text = token as Tokens.Text;
        return <Fragment key={index}>{text.tokens ? renderInline(text.tokens, open, depth + 1) : text.text}</Fragment>;
      }
      case 'strong':
        return <strong key={index}>{renderInline((token as Tokens.Strong).tokens, open, depth + 1)}</strong>;
      case 'em':
        return <em key={index}>{renderInline((token as Tokens.Em).tokens, open, depth + 1)}</em>;
      case 'del':
        return <del key={index}>{renderInline((token as Tokens.Del).tokens, open, depth + 1)}</del>;
      case 'codespan':
        return <code key={index}>{(token as Tokens.Codespan).text}</code>;
      case 'br':
        return <br key={index} />;
      case 'link': {
        const link = token as Tokens.Link;
        const label = renderInline(link.tokens, open, depth + 1);
        if (!isSafeExternalUrl(link.href)) {
          return <Fragment key={index}>{label}</Fragment>;
        }
        return (
          <button key={index} type="button" className="md-link plain" data-sound="none" data-no-ripple title={link.href} onClick={() => open(link.href)}>
            {label}
          </button>
        );
      }
      case 'image':
        return <Fragment key={index}>{(token as Tokens.Image).text}</Fragment>;
      case 'html':
        return null;
      default:
        return 'text' in token && typeof token.text === 'string' ? <Fragment key={index}>{token.text}</Fragment> : null;
    }
  });
}
