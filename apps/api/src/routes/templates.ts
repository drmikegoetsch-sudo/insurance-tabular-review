import { Router } from "express";
import { TemplateError, buildColumns, getCatalog } from "@insurance-tabular-review/templates";

export const templatesRouter = Router();

/** Catalog summaries without prompts, so prompts never reach the browser. */
templatesRouter.get("/", (_req, res) => {
  const catalog = getCatalog();
  const strip = <T extends { columns: { prompt?: string; calculation?: string }[] }>(item: T) => ({
    ...item,
    columns: item.columns.map(({ prompt: _p, calculation: _c, ...rest }) => rest),
  });
  res.json({
    name: catalog.name,
    schema_version: catalog.schema_version,
    templates: catalog.templates.map(strip),
    extensions: catalog.extensions.map(strip),
  });
});

templatesRouter.post("/columns", (req, res) => {
  const { template_id, extension_ids, include_optional } = req.body as {
    template_id?: unknown;
    extension_ids?: unknown;
    include_optional?: unknown;
  };
  if (typeof template_id !== "string" || !template_id.trim()) {
    res.status(400).json({ detail: "template_id is required" });
    return;
  }
  try {
    const columns = buildColumns({
      templateId: template_id.trim(),
      extensionIds: Array.isArray(extension_ids) ? extension_ids.filter((x): x is string => typeof x === "string") : [],
      includeOptional: include_optional === true,
    });
    res.json({ columns });
  } catch (error) {
    if (error instanceof TemplateError) {
      res.status(error.code === "template_not_found" ? 404 : 400).json({ code: error.code, detail: error.message });
      return;
    }
    throw error;
  }
});
