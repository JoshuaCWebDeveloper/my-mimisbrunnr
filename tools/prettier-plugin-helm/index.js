/* eslint-disable no-useless-escape */

// Prettier 2.x plugin (CommonJS) for Helm YAML with Go templates.
// Strategy: detect standalone template lines and normalize them;
// leave mixed YAML lines intact. If a file has no templates, return it unchanged.

const builders = require('prettier').doc.builders;
const { concat, hardline, join } = builders;

const HELM_AST = 'helm-ast';
const TEMPLATE_OPEN_RE = /^\s*\{\{\-?/;
const TEMPLATE_CLOSE_LINE_RE = /\-?\}\}\s*$/;
const TEMPLATE_STANDALONE_RE = /^\s*\{\{\-?[\s\S]*?\-?\}\}\s*$/;
const HAS_TEMPLATE_ANYWHERE_RE = /\{\{\-?|\-?\}\}/;

function classifyTag(inner) {
    const t = inner.trim();
    if (/^end\b/.test(t)) return 'end';
    if (/^else(\s+if\b.*)?$/.test(t)) return 'else';
    if (/^(if|range|with|define|block)\b/.test(t)) return 'start';
    if (/^\/\*[\s\S]*\*\/$/.test(t)) return 'comment';
    return 'stmt';
}

function formatTag(rawLine) {
    const leading = (rawLine.match(/^\s*/) || [''])[0];
    const open = rawLine.includes('{{-') ? '{{-' : '{{';
    const close = rawLine.includes('-}}') ? '-}}' : '}}';

    const start = rawLine.indexOf('{{');
    const end = rawLine.lastIndexOf('}}');
    const innerRaw =
        start >= 0 && end >= start
            ? rawLine
                  .slice(start + 2, end)
                  .replace(/^-/, '')
                  .replace(/-$/, '')
            : '';

    classifyTag(innerRaw); // (reserved for future smarter rules)
    const inner = innerRaw.trim();
    const spaced = inner.length ? ` ${inner} ` : ' ';

    return leading + open + spaced + close;
}

function parse(text /*, parsers, options */) {
    const lines = text.split(/\r?\n/);
    const hasTemplates = HAS_TEMPLATE_ANYWHERE_RE.test(text);
    return { type: 'HelmDoc', hasTemplates, lines };
}

const printer = {
    print(path /*, options, print */) {
        const node = path.getValue();

        if (!node.hasTemplates) {
            // No templates: return original text unchanged (safer than trying YAML in 2.x).
            return concat([join(hardline, node.lines), hardline]);
        }

        const out = node.lines.map(line => {
            const isStandaloneTemplate =
                TEMPLATE_STANDALONE_RE.test(line) &&
                TEMPLATE_OPEN_RE.test(line) &&
                TEMPLATE_CLOSE_LINE_RE.test(line);

            if (isStandaloneTemplate) return formatTag(line);
            return line.replace(/[ \t]+$/g, ''); // strip trailing whitespace only
        });

        return concat([join(hardline, out), hardline]);
    },
    embed: () => null,
};

module.exports = {
    languages: [
        {
            name: 'Helm',
            parsers: ['helm'],
            tmScope: 'source.helm',
        },
    ],
    parsers: {
        helm: {
            parse,
            astFormat: HELM_AST,
            locStart: () => 0,
            locEnd: node =>
                node && node.lines ? node.lines.join('\n').length : 0,
        },
    },
    printers: {
        [HELM_AST]: printer,
    },
};
