package views

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/a-h/templ"
	"portfolio/internal/portfolio"
)

func windowTestContent(value string) templ.Component {
	return templ.ComponentFunc(func(_ context.Context, writer io.Writer) error {
		_, err := io.WriteString(writer, value)
		return err
	})
}

func TestWindowSlotsAndDimensions(t *testing.T) {
	var output bytes.Buffer
	component := Window(WindowOptions{
		ID: "sample", Title: "sample.ts", Width: "48rem", Height: "32rem",
		MinWidth: "20rem", MinHeight: "10rem", MaxWidth: "60rem", MaxHeight: "40rem",
		Decoration: "tab", Attributes: templ.Attributes{"data-popup": "sample"},
	}, WindowSlots{
		Information: windowTestContent("DISTANCE"), Commands: windowTestContent("ACTIONS"),
		Touch: windowTestContent("TOUCH"), Help: windowTestContent("HELP"), Tips: windowTestContent("TIPS"),
	})
	if err := component.Render(templ.WithChildren(context.Background(), windowTestContent("BODY")), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{
		`<dialog id="sample"`, `aria-labelledby="sample-title"`, `data-window-decoration="tab"`,
		`--window-width:48rem;`, `--window-height:32rem;`, `--window-min-width:20rem;`,
		`--window-min-height:10rem;`, `--window-max-width:60rem;`, `--window-max-height:40rem;`,
		`data-popup="sample"`, `data-window-handle`, `data-window-close`,
		`aria-expanded="false"`, `aria-controls="sample-help"`,
		`data-window-help hidden`, `aria-controls="sample-tips"`, `data-window-tips hidden`,
		`DISTANCE`, `ACTIONS`, `TOUCH`, `HELP`, `TIPS`, `BODY`,
	} {
		assertContains(t, html, want)
	}
	if strings.Index(html, "BODY") > strings.Index(html, "ACTIONS") {
		t.Fatal("commands should follow the content body")
	}
}

func TestSkiSeparatesControlsAndTipsWithoutYetiSpoilers(t *testing.T) {
	for _, item := range []struct {
		component templ.Component
		want      string
		unwanted  []string
	}{
		{skiHelp(), "Orientar os esquis", []string{"Ganhe 10 pontos", "slalom", "yeti"}},
		{skiTips(), "Ganhe 10 pontos", []string{"Orientar os esquis", "yeti", "Yeti"}},
	} {
		var output bytes.Buffer
		if err := item.component.Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		assertContains(t, output.String(), item.want)
		for _, unwanted := range item.unwanted {
			assertNotContains(t, output.String(), unwanted)
		}
	}
}

func TestWindowOmitsEmptyAreasAndPreservesInlineSemantics(t *testing.T) {
	for _, inline := range []bool{true, false} {
		var output bytes.Buffer
		if err := Window(WindowOptions{ID: "note", Title: "note.md", Decoration: "fold", Inline: inline}, WindowSlots{}).Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		html := output.String()
		assertContains(t, html, `class="window__sheet document-fold"`)
		assertNotContains(t, html, `window__commands`)
		assertNotContains(t, html, `window__information`)
		if inline {
			assertContains(t, html, `<section id="note"`)
			assertNotContains(t, html, `<dialog`)
		} else {
			assertContains(t, html, `<dialog id="note"`)
		}
	}
}

func TestGamesAndCollectionsUseSharedWindowAndCommandAreas(t *testing.T) {
	for _, component := range []templ.Component{SkiGame("/portfolio"), SnakeGame(), ProjectArchiveFloating(nil, "")} {
		var output bytes.Buffer
		if err := component.Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		html := output.String()
		for _, want := range []string{`data-window`, `window__sheet`, `data-window-body`, `data-window-commands`, `data-window-decoration="tab"`} {
			assertContains(t, html, want)
		}
		assertNotContains(t, html, `document-note__heading`)
	}
	var output bytes.Buffer
	if err := DocumentNotes([]portfolio.Document{{Slug: "sample", Title: "Sample", Kind: portfolio.DocumentNote}}, "").Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	assertContains(t, output.String(), `data-window-decoration="fold"`)
	assertNotContains(t, output.String(), `data-window-commands`)
}

func TestArrowGlyphUsesPlexTextGlyphForEveryDirection(t *testing.T) {
	for _, direction := range []string{"left", "up", "down", "right"} {
		var output bytes.Buffer
		if err := ArrowGlyph(direction).Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		assertContains(t, output.String(), `class="ui-arrow ui-arrow--`+direction+`"`)
		assertContains(t, output.String(), "↑\uFE0E")
	}
}
