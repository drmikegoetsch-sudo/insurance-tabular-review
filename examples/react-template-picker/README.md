# React example: template picker

The package ships a small React component under the `react` subpath. It renders
the grouped template list, the extensions that apply to the chosen template,
and the "include all columns" toggle, and hands back the resolved column list.

```tsx
import { useState } from "react";
import { TemplatePicker, type TemplateSelection } from "@insurance-tabular-review/templates/react";

export function NewReviewDialog({ onCreate }: { onCreate: (columns: TemplateSelection["columns"]) => void }) {
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (selection) onCreate(selection.columns); }}>
      <TemplatePicker onChange={setSelection} initialTemplateId="CI04" />
      <button type="submit" disabled={!selection}>Create review</button>
    </form>
  );
}
```

The component carries only minimal inline layout so it reads correctly
unstyled. Pass `classNames` to map its parts onto your design system, or copy
`packages/review-templates/src/react/TemplatePicker.tsx` into your app and
restyle it; it is about 150 lines and depends only on the package's pure
functions.

The clickable mock in `demo/index.html` shows the same picker inside the full
"New review" flow (Details, then Access, then Add documents).
