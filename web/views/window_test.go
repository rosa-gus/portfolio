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
	for _, component := range []templ.Component{SkiGame("/portfolio", ""), SnakeGame(""), ProjectArchiveFloating(nil, "")} {
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

func TestGameAndNoteRecordsRenderInTheirWindows(t *testing.T) {
	var output bytes.Buffer
	const repository = "https://example.com/portfolio"
	if err := SkiGame("", repository).Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	for _, want := range []string{
		`<h2 class="window__title" id="ski-game-title"><span class="window__title-text">ski.ts</span>`,
		`aria-describedby="ski-game-record-description" aria-controls="ski-game-record" aria-haspopup="dialog" aria-expanded="false">ski.ts</button>`,
		`<span id="ski-game-record-description" hidden>Abre os metadados</span>`,
		`<dialog id="ski-game-record" class="window window--record" data-window-record data-window-decoration="tab"`,
		`id="ski-game-record-title">metadados</h2>`,
		`href="https://example.com/portfolio/tree/main/web/scripts/games/ski"`,
		`v0.1.0`, `GPL-3.0-only`, `SkiFree, de Chris Pirih`,
	} {
		assertContains(t, html, want)
	}
	assertNotContains(t, html, `data-tooltip`)

	for _, game := range []struct {
		component   templ.Component
		inspiration string
	}{
		{SkiGame("", repository), "SkiFree, de Chris Pirih"},
		{SnakeGame(repository), ""},
	} {
		output.Reset()
		if err := game.component.Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		html := output.String()
		intro, record, found := strings.Cut(html, `class="window window--record"`)
		if !found {
			t.Fatal("game should render a metadata window")
		}
		assertContains(t, intro, `class="game-credits"`)
		assertContains(t, intro, `data-credit-leader aria-hidden="true">.</span>`)
		assertContains(t, intro, "Rosa Gus")
		assertContains(t, record, "Rosa Gus")
		assertNotContains(t, record, "data-credit-leader")
		if game.inspiration == "" {
			assertNotContains(t, html, "<dt>Inspiração</dt>")
		} else if got := strings.Count(html, game.inspiration); got != 2 {
			t.Errorf("inspiration should appear in the intro and the record, got %d occurrences", got)
		}
	}

	output.Reset()
	notes := []portfolio.Document{
		{Slug: "sample", Title: "Sample", Kind: portfolio.DocumentNote, UpdatedAt: "2026-11-20"},
		{Slug: "empty", Title: "Empty", Kind: portfolio.DocumentNote},
	}
	if err := DocumentNotes(notes, "").Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html = output.String()
	assertContains(t, html, `aria-controls="note-sample-record" aria-haspopup="dialog" aria-expanded="false">Sample.md</button>`)
	assertContains(t, html, `<time datetime="2026-11-20">20 NOV 2026</time>`)
	assertContains(t, html, `data-window-decoration="fold"`)
	assertContains(t, html, `<header class="window__heading" data-window-handle><h2 class="window__title" id="note-sample-title"`)
	assertNotContains(t, html, `id="note-empty-record"`)
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
