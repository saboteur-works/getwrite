//! Renders CSL citations and a bibliography with Hayagriva and returns them as
//! structured text runs (text plus formatting flags), not as HTML or plain text.
//!
//! One exported function, [`render`]. Input is style XML, locale XML, CSL-JSON
//! items and an ordered list of citations (JSON). Output is a JSON string. On
//! failure the function throws a JSON string `{"error":{"stage":...,"message":...}}`
//! naming what failed; it never returns an empty render in place of an error.

use hayagriva::citationberg::{
    json::Item, taxonomy::Locator, FontStyle, FontVariant, FontWeight, IndependentStyle,
    LocaleFile, VerticalAlign,
};
use hayagriva::{
    BibliographyDriver, BibliographyRequest, CitationItem, CitationRequest, ElemChild,
    ElemChildren, Formatting, LocatorPayload, Rendered, SpecificLocator,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// A locator on a citation: label `page`, `paragraph` or `line`, and a value.
#[derive(Deserialize)]
struct LocatorIn {
    label: String,
    value: String,
}

/// One citation, in document order. The optional locator applies to the first
/// item id of the citation.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CitationIn {
    item_ids: Vec<String>,
    locator: Option<LocatorIn>,
    note_number: usize,
}

/// A piece of text with the formatting flags that are set on it.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Run {
    text: String,
    #[serde(skip_serializing_if = "is_false")]
    italic: bool,
    #[serde(skip_serializing_if = "is_false")]
    bold: bool,
    #[serde(skip_serializing_if = "is_false")]
    small_caps: bool,
    #[serde(skip_serializing_if = "is_false")]
    superscript: bool,
    #[serde(skip_serializing_if = "is_false")]
    subscript: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    link: Option<String>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CitationOut {
    note_number: usize,
    runs: Vec<Run>,
}

#[derive(Serialize)]
struct BibliographyOut {
    key: String,
    runs: Vec<Run>,
}

#[derive(Serialize)]
struct Output {
    citations: Vec<CitationOut>,
    bibliography: Vec<BibliographyOut>,
}

/// What failed, and why.
#[derive(Serialize, Debug, PartialEq)]
struct RenderError {
    stage: &'static str,
    message: String,
}

#[derive(Serialize)]
struct ErrorEnvelope<'a> {
    error: &'a RenderError,
}

fn fail(stage: &'static str, message: impl Into<String>) -> RenderError {
    RenderError { stage, message: message.into() }
}

fn locator_label(label: &str) -> Result<Locator, RenderError> {
    match label {
        "page" => Ok(Locator::Page),
        "paragraph" => Ok(Locator::Paragraph),
        "line" => Ok(Locator::Line),
        other => Err(fail("citation", format!("unknown locator label {other:?}"))),
    }
}

fn run_of(text: &str, f: &Formatting, link: Option<&str>) -> Run {
    Run {
        text: text.to_string(),
        italic: f.font_style == FontStyle::Italic,
        bold: f.font_weight == FontWeight::Bold,
        small_caps: f.font_variant == FontVariant::SmallCaps,
        superscript: f.vertical_align == VerticalAlign::Sup,
        subscript: f.vertical_align == VerticalAlign::Sub,
        link: link.map(str::to_string),
    }
}

fn collect_runs(children: &ElemChildren, out: &mut Vec<Run>) {
    for child in &children.0 {
        match child {
            ElemChild::Text(t) => out.push(run_of(&t.text, &t.formatting, None)),
            ElemChild::Elem(e) => collect_runs(&e.children, out),
            ElemChild::Markup(m) => out.push(run_of(m, &Formatting::default(), None)),
            ElemChild::Link { text, url } => {
                out.push(run_of(&text.text, &text.formatting, Some(url)))
            }
            ElemChild::Transparent { .. } => {}
        }
    }
}

fn runs_of(children: &ElemChildren) -> Vec<Run> {
    let mut runs = Vec::new();
    collect_runs(children, &mut runs);
    runs.retain(|r| !r.text.is_empty());
    runs
}

fn to_output(rendered: &Rendered, note_numbers: &[usize]) -> Output {
    let citations = rendered
        .citations
        .iter()
        .zip(note_numbers)
        .map(|(c, n)| CitationOut {
            note_number: c.note_number.unwrap_or(*n),
            runs: runs_of(&c.citation),
        })
        .collect();
    let bibliography = rendered
        .bibliography
        .as_ref()
        .map(|b| {
            b.items
                .iter()
                .map(|i| BibliographyOut { key: i.key.clone(), runs: runs_of(&i.content) })
                .filter(|e| !e.runs.is_empty())
                .collect()
        })
        .unwrap_or_default();
    Output { citations, bibliography }
}

fn render_impl(
    style_xml: &str,
    locale_xml: &str,
    items_json: &str,
    citations_json: &str,
) -> Result<String, RenderError> {
    let style = IndependentStyle::from_xml(style_xml)
        .map_err(|e| fail("style", format!("{e:?}")))?;
    let locales = [LocaleFile::from_xml(locale_xml)
        .map_err(|e| fail("locale", format!("{e:?}")))?
        .into()];
    let items: Vec<Item> =
        serde_json::from_str(items_json).map_err(|e| fail("items", e.to_string()))?;
    let citations: Vec<CitationIn> =
        serde_json::from_str(citations_json).map_err(|e| fail("citations", e.to_string()))?;

    let find = |id: &str| {
        items.iter().find(|i| {
            matches!(i.0.get("id"),
                Some(hayagriva::citationberg::json::Value::String(s)) if s == id)
        })
    };

    let mut driver = BibliographyDriver::new();
    for (n, cite) in citations.iter().enumerate() {
        let mut cite_items = Vec::new();
        for (idx, id) in cite.item_ids.iter().enumerate() {
            let entry = find(id).ok_or_else(|| {
                fail("citation", format!("citation {n} names unknown item {id:?}"))
            })?;
            let locator = match (&cite.locator, idx) {
                (Some(l), 0) => Some(SpecificLocator(
                    locator_label(&l.label)?,
                    LocatorPayload::Str(&l.value),
                )),
                _ => None,
            };
            cite_items.push(CitationItem::with_locator(entry, locator));
        }
        driver.citation(CitationRequest::new(
            cite_items,
            &style,
            None,
            &locales,
            Some(cite.note_number),
        ));
    }
    let rendered = driver.finish(BibliographyRequest {
        style: &style,
        locale: None,
        locale_files: &locales,
    });

    if rendered.citations.len() != citations.len() {
        return Err(fail(
            "render",
            format!(
                "engine returned {} citations for {} requested",
                rendered.citations.len(),
                citations.len()
            ),
        ));
    }
    let note_numbers: Vec<usize> = citations.iter().map(|c| c.note_number).collect();
    serde_json::to_string(&to_output(&rendered, &note_numbers))
        .map_err(|e| fail("render", e.to_string()))
}

/// Render citations and the bibliography. Returns the output JSON, or throws a
/// JSON error string naming the failing stage (`style`, `locale`, `items`,
/// `citations`, `citation` or `render`).
#[wasm_bindgen]
pub fn render(
    style_xml: &str,
    locale_xml: &str,
    items_json: &str,
    citations_json: &str,
) -> Result<String, JsValue> {
    render_impl(style_xml, locale_xml, items_json, citations_json).map_err(|e| {
        let body = serde_json::to_string(&ErrorEnvelope { error: &e })
            .unwrap_or_else(|_| format!("{{\"error\":{{\"stage\":\"{}\"}}}}", e.stage));
        JsValue::from_str(&body)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bad_style_names_the_style() {
        let err = render_impl("<not-a-style/>", "<locale/>", "[]", "[]").unwrap_err();
        assert_eq!(err.stage, "style");
    }

    #[test]
    fn unknown_locator_label_is_refused() {
        let err = locator_label("chapter").unwrap_err();
        assert_eq!(err.stage, "citation");
    }

    #[test]
    fn empty_children_give_no_runs() {
        assert!(runs_of(&ElemChildren(vec![])).is_empty());
    }

    #[test]
    fn plain_run_has_no_flags() {
        let r = run_of("x", &Formatting::default(), None);
        assert!(!r.italic && !r.bold && !r.small_caps && !r.superscript && !r.subscript);
        assert_eq!(r.link, None);
    }
}
