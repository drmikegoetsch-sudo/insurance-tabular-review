# Design

The review page design lives in code: `web/src/ReviewPage.tsx` is the screen,
`web/src/SourcePanel.tsx` and `web/src/NewReviewDialog.tsx` are its panels,
and `web/src/components/ui/` holds the two shadcn-style primitives it uses.
Run `npm run dev` from the repo root to see it against the API.

Add design source files (Figma exports, screenshots, redlines) to this folder
as they land; keep the React app as the reference for behavior.
