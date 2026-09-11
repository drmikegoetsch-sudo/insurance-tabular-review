// Tiny renderer for the markdown subset cells use: bullets, bold, line breaks.
// No HTML is ever injected; text is rendered as React nodes.

import React from "react";

function inline(text: string, key: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${key}-${i}`} className="font-semibold text-gray-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>
    ),
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-4 space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b, `li-${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p-${i}`}>{inline(line, `p-${i}`)}</p>);
  });
  flush();
  return <div className={className}>{blocks}</div>;
}
