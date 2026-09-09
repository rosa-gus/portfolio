package main

import (
	"flag"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"os"
	"path/filepath"

	"portfolio/internal/dither"
)

func main() {
	input := flag.String("input", "", "source PNG, JPEG, or GIF image")
	output := flag.String("output", "", "destination PNG file")
	width := flag.Int("width", 0, "output width; 0 preserves the source width")
	matrix := flag.Int("matrix", 8, "Bayer matrix size: 2, 4, or 8")
	darkHex := flag.String("dark", "#0a0a09", "dark color in #RRGGBB format")
	lightHex := flag.String("light", "#fffefa", "light color in #RRGGBB format")
	contrast := flag.Float64("contrast", 1.0, "contrast multiplier")
	flag.Parse()

	if *input == "" || *output == "" {
		fail("-input and -output are required")
	}

	dark, err := dither.ParseHexColor(*darkHex)
	if err != nil {
		fail(err.Error())
	}
	light, err := dither.ParseHexColor(*lightHex)
	if err != nil {
		fail(err.Error())
	}

	sourceFile, err := os.Open(*input)
	if err != nil {
		fail(fmt.Sprintf("open source: %v", err))
	}
	source, _, err := image.Decode(sourceFile)
	closeErr := sourceFile.Close()
	if err != nil {
		fail(fmt.Sprintf("decode source: %v", err))
	}
	if closeErr != nil {
		fail(fmt.Sprintf("close source: %v", closeErr))
	}

	result, err := dither.Apply(source, dither.Options{
		Width:    *width,
		Matrix:   *matrix,
		Dark:     dark,
		Light:    light,
		Contrast: *contrast,
	})
	if err != nil {
		fail(err.Error())
	}

	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		fail(fmt.Sprintf("create destination directory: %v", err))
	}
	destination, err := os.Create(*output)
	if err != nil {
		fail(fmt.Sprintf("create destination: %v", err))
	}
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(destination, result); err != nil {
		destination.Close()
		fail(fmt.Sprintf("encode PNG: %v", err))
	}
	if err := destination.Close(); err != nil {
		fail(fmt.Sprintf("close destination: %v", err))
	}
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, "dither:", message)
	os.Exit(1)
}
