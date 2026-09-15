"use client";

import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";

const allowedTags = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "UL",
  "OL",
  "LI",
]);

function plainTextToHtml(value: string) {
  const block = document.createElement("div");
  block.textContent = value;
  return block.innerHTML.replace(/\n/g, "<br>");
}

export function sanitizeRichText(value: string) {
  if (typeof document === "undefined" || !value) return "";
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const output = document.createElement("div");

  function copyNode(node: Node, parent: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    if (!allowedTags.has(node.tagName)) {
      node.childNodes.forEach((child) => copyNode(child, parent));
      return;
    }

    const tag =
      node.tagName === "B"
        ? "strong"
        : node.tagName === "I"
          ? "em"
          : node.tagName.toLowerCase();
    const clean = document.createElement(tag);
    node.childNodes.forEach((child) => copyNode(child, clean));
    parent.appendChild(clean);
  }

  parsed.body.childNodes.forEach((node) => copyNode(node, output));
  return output.innerHTML;
}

function editorHtml(value: string) {
  if (!value) return "";
  return /<\/?[a-z][\s\S]*>/i.test(value)
    ? sanitizeRichText(value)
    : plainTextToHtml(value);
}

type RichTextEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
};

const tools = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
  { command: "insertUnorderedList", label: "Bulleted list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
] as const;

export function RichTextEditor({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  disabled = false,
}: RichTextEditorProps) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = surface.current;
    if (!node || document.activeElement === node) return;
    const next = editorHtml(value);
    if (node.innerHTML !== next) node.innerHTML = next;
  }, [value]);

  function commit() {
    const node = surface.current;
    if (!node) return;
    const clean = sanitizeRichText(node.innerHTML);
    const text = node.textContent?.trim() ?? "";
    onChange(text ? clean : "");
  }

  function format(command: (typeof tools)[number]["command"]) {
    if (disabled) return;
    surface.current?.focus();
    document.execCommand(command);
    commit();
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    commit();
  }

  return (
    <div className="rich-text-editor" data-invalid={invalid || undefined}>
      <div
        className="rich-text-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        {tools.map(({ command, label, icon: Icon }) => (
          <button
            key={command}
            type="button"
            disabled={disabled}
            aria-label={label}
            title={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => format(command)}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        ref={surface}
        id={id}
        className="rich-text-surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-invalid={invalid}
        aria-disabled={disabled}
        aria-describedby={describedBy}
        onInput={commit}
        onBlur={commit}
        onPaste={paste}
      />
    </div>
  );
}

export function RichTextContent({ value }: { value: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => setHtml(editorHtml(value)), [value]);

  if (!html) return <div className="rich-text-content">{value}</div>;
  return (
    <div
      className="rich-text-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
