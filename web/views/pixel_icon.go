package views

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/a-h/templ"
)

// Each # is one pixel; dots are transparent. Patterns share a 12×12 canvas.
var pixelIconPatterns = map[string][]string{
	"snake": {
		".........###",
		".........#.#",
		".##......###",
		".##.........",
		"............",
		".##....##...",
		".##....##...",
		"............",
		".##.##.##...",
		".##.##.##...",
		"............",
		"............",
	},
	"ski": {
		".....##.....",
		".....##.....",
		"....####....",
		"...#.##.#...",
		"..#..##..#..",
		".....##.....",
		".#..#..#..#.",
		".#..#..#..#.",
		".#.#....#.#.",
		"..#......#..",
		".###....###.",
		"............",
	},
}

func pixelIconStyle(pattern []string) map[string]templ.SafeCSSProperty {
	var shadows []string
	width := 0
	for y, row := range pattern {
		width = max(width, len(row))
		for x, pixel := range row {
			if pixel == '#' {
				shadows = append(shadows, fmt.Sprintf("calc(%d * var(--pixel-size)) calc(%d * var(--pixel-size)) 0 currentColor", x, y))
			}
		}
	}
	// Values contain only integer coordinates and fixed CSS tokens, never user input.
	// The trusted type preserves calc(), var(), and commas through templ sanitization.
	return map[string]templ.SafeCSSProperty{
		"--pixel-columns": templ.SafeCSSProperty(strconv.Itoa(width)),
		"--pixel-rows":    templ.SafeCSSProperty(strconv.Itoa(len(pattern))),
		"--pixel-shadow":  templ.SafeCSSProperty(strings.Join(shadows, ",")),
	}
}
