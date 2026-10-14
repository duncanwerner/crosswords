import MarkdownIt from 'markdown-it';

/**
 * the reviewer's replies as HTML. plain markdown-it rather than
 * llm-support-core's Format(): reviews have no code to highlight or maths to
 * typeset, and those two libraries were most of the chat's bundle. raw HTML
 * in a reply is escaped; callers still sanitize.
 */
const md = new MarkdownIt({ linkify: true });

// links open in a new tab, away from the editor
const defaultLink = md.renderer.rules.link_open ?? ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options));
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i].attrSet('target', '_blank');
  tokens[i].attrSet('rel', 'noopener noreferrer');
  return defaultLink(tokens, i, options, env, self);
};

export const renderMarkdown = (text: string) => md.render(text);
