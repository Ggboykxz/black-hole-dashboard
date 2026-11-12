import type { ReactNode } from "react";

/**
 * A compact Markdown renderer — no dependency, no `dangerouslySetInnerHTML`.
 *
 * It handles what the repository's documents actually use: headings,
 * paragraphs, bullet and numbered lists, pipe tables, fenced code,
 * blockquotes, horizontal rules, and the inline marks (**bold**, *italic*,
 * `code`, [links](…)). Anything else is rendered as plain text, which is
 * safer than a half-parser that mangles a table.
 */

function inline(text: string, keyPrefix = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-medium text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-[#151a23] px-1 py-[1px] font-mono text-[0.9em] text-accent"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      const href = mm[2];
      out.push(
        <a
          key={key}
          href={href}
          className="text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
        >
          {mm[1]}
        </a>,
      );
    } else {
      out.push(
        <em key={key} className="text-dim">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

export default function Markdown({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-line bg-[#0a0d12] p-3 font-mono text-[11.5px] leading-relaxed text-dim"
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }

    // table
    if (line.trim().startsWith("|") && lines[i + 1]?.includes("---")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                {head.map((h, k) => (
                  <th key={k}>{inline(h, `h${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} className="text-dim">
                      {inline(c, `c${k}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = [
        "text-[19px]",
        "text-[16px]",
        "text-[14px]",
        "text-[13px]",
        "text-[12px]",
        "text-[11px]",
      ];
      blocks.push(
        <h2
          key={key++}
          className={`${sizes[level - 1]} mt-5 mb-2 font-medium tracking-tight text-ink first:mt-0`}
        >
          {inline(h[2], `hd${key}`)}
        </h2>,
      );
      i++;
      continue;
    }

    // blockquote
    if (line.trim().startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 rounded-r-lg border-l-2 border-accent/40 bg-accent/5 py-2 pl-3 text-[12.5px] leading-relaxed text-dim"
        >
          {body.map((b, k) => (
            <p key={k}>{inline(b, `q${key}-${k}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-4 border-line" />);
      i++;
      continue;
    }

    // list
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag
          key={key++}
          className={`my-2 space-y-1 pl-5 text-[12.5px] leading-relaxed text-dim ${
            ordered ? "list-decimal" : "list-disc"
          } marker:text-faint`}
        >
          {items.map((it, k) => (
            <li key={k}>{inline(it, `li${key}-${k}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    // paragraph
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2 text-[12.5px] leading-relaxed text-dim">
        {inline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
