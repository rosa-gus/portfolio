package views

import (
	"context"
	"io"
	"net/url"
	"strings"

	"github.com/a-h/templ"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/renderer"
	goldmarkhtml "github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/util"
	"portfolio/internal/portfolio"
	"portfolio/internal/sitepath"
)

type markdownLinkPolicy struct {
	basePath string
}

type resolvedMarkdownLink struct {
	href        string
	externalTab bool
	allowed     bool
}

func renderMarkdown(document portfolio.MarkdownDocument, basePath string) templ.Component {
	return templ.ComponentFunc(func(ctx context.Context, writer io.Writer) error {
		markdown := goldmark.New(
			goldmark.WithRenderer(
				renderer.NewRenderer(
					renderer.WithNodeRenderers(
						util.Prioritized(goldmarkhtml.NewRenderer(), 1000),
						util.Prioritized(&markdownLinkPolicy{basePath: basePath}, 500),
					),
				),
			),
		)

		return markdown.Convert([]byte(document.Source), writer)
	})
}

func (policy *markdownLinkPolicy) RegisterFuncs(registerer renderer.NodeRendererFuncRegisterer) {
	registerer.Register(ast.KindLink, policy.renderLink)
	registerer.Register(ast.KindAutoLink, policy.renderAutoLink)
}

func (policy *markdownLinkPolicy) renderLink(
	writer util.BufWriter,
	_ []byte,
	node ast.Node,
	entering bool,
) (ast.WalkStatus, error) {
	link := node.(*ast.Link)
	resolved := resolveMarkdownLink(policy.basePath, string(link.Destination))
	if !resolved.allowed {
		return ast.WalkContinue, nil
	}

	if entering {
		writeMarkdownLinkStart(writer, resolved, link.Title)
	} else {
		writeMarkdownLinkEnd(writer, resolved)
	}
	return ast.WalkContinue, nil
}

func (policy *markdownLinkPolicy) renderAutoLink(
	writer util.BufWriter,
	source []byte,
	node ast.Node,
	entering bool,
) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}

	link := node.(*ast.AutoLink)
	destination := string(link.URL(source))
	if link.AutoLinkType == ast.AutoLinkEmail &&
		!strings.HasPrefix(strings.ToLower(destination), "mailto:") {
		destination = "mailto:" + destination
	}
	resolved := resolveMarkdownLink(policy.basePath, destination)
	if !resolved.allowed {
		_, _ = writer.Write(util.EscapeHTML(link.Label(source)))
		return ast.WalkSkipChildren, nil
	}

	writeMarkdownLinkStart(writer, resolved, nil)
	_, _ = writer.Write(util.EscapeHTML(link.Label(source)))
	writeMarkdownLinkEnd(writer, resolved)
	return ast.WalkSkipChildren, nil
}

func writeMarkdownLinkStart(
	writer util.BufWriter,
	link resolvedMarkdownLink,
	title []byte,
) {
	_, _ = writer.WriteString(`<a href="`)
	_, _ = writer.Write(util.EscapeHTML(util.URLEscape([]byte(link.href), true)))
	_ = writer.WriteByte('"')
	if len(title) > 0 {
		_, _ = writer.WriteString(` title="`)
		goldmarkhtml.DefaultWriter.Write(writer, title)
		_ = writer.WriteByte('"')
	}
	if link.externalTab {
		_, _ = writer.WriteString(` target="_blank" rel="noreferrer noopener"`)
	}
	_ = writer.WriteByte('>')
}

func writeMarkdownLinkEnd(writer util.BufWriter, link resolvedMarkdownLink) {
	if link.externalTab {
		_, _ = writer.WriteString(`<span class="project-content__external-marker" aria-hidden="true"> [↗︎]</span><span class="visually-hidden"> (abre em nova aba)</span>`)
	}
	_, _ = writer.WriteString(`</a>`)
}

func resolveMarkdownLink(basePath, rawDestination string) resolvedMarkdownLink {
	destination := strings.TrimSpace(rawDestination)
	if destination == "" ||
		strings.Contains(destination, `\`) ||
		strings.HasPrefix(destination, "//") ||
		goldmarkhtml.IsDangerousURL([]byte(destination)) {
		return resolvedMarkdownLink{}
	}

	parsed, err := url.Parse(destination)
	if err != nil {
		return resolvedMarkdownLink{}
	}

	switch strings.ToLower(parsed.Scheme) {
	case "":
		if parsed.Host != "" {
			return resolvedMarkdownLink{}
		}
		if strings.HasPrefix(destination, "/") {
			destination = sitepath.Resolve(basePath, destination)
		}
		return resolvedMarkdownLink{href: destination, allowed: true}
	case "http", "https":
		if parsed.Host == "" {
			return resolvedMarkdownLink{}
		}
		return resolvedMarkdownLink{
			href:        parsed.String(),
			externalTab: true,
			allowed:     true,
		}
	case "mailto":
		if parsed.Opaque == "" {
			return resolvedMarkdownLink{}
		}
		return resolvedMarkdownLink{href: parsed.String(), allowed: true}
	default:
		return resolvedMarkdownLink{}
	}
}
