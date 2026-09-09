package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"portfolio/internal/portfolio"
	"portfolio/internal/sitepath"
	"portfolio/web"
	"portfolio/web/views"
)

func main() {
	origin, err := sitepath.NormalizeOrigin(envOrDefault("SITE_ORIGIN", "http://localhost:8080"))
	if err != nil {
		log.Fatal(err)
	}
	publicURL := sitepath.PublicURL(origin, "")

	mux := http.NewServeMux()

	mux.Handle("GET /assets/", http.FileServerFS(web.Static()))
	mux.Handle("GET /favicon/", http.FileServerFS(web.Static()))
	mux.Handle("GET /projects/", http.FileServerFS(web.Static()))

	mux.HandleFunc("GET /manifest.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Static(), "manifest.json")
	})
	mux.HandleFunc("GET /about.jpeg", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Static(), "about.jpeg")
	})
	mux.HandleFunc("GET /fish.mp4", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Static(), "fish.mp4")
	})
	mux.HandleFunc("GET /fish.png", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Static(), "fish.png")
	})
	mux.HandleFunc("GET /og-image.png", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Static(), "og-image.png")
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		if err := views.Home(portfolio.Profile, portfolio.Projects, "", publicURL).Render(r.Context(), w); err != nil {
			http.Error(w, "The page could not be rendered.", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("GET /case/{slug}", func(w http.ResponseWriter, r *http.Request) {
		project, ok := portfolio.FindProject(r.PathValue("slug"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		if err := views.ProjectPage(portfolio.Profile, project, "", publicURL).Render(r.Context(), w); err != nil {
			http.Error(w, "The project could not be rendered.", http.StatusInternalServerError)
		}
	})

	server := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("portfolio available", "url", publicURL)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("failed to shut down server", "error", err)
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
