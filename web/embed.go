package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var files embed.FS

func Static() fs.FS {
	static, err := fs.Sub(files, "dist")
	if err != nil {
		panic(err)
	}
	return static
}
