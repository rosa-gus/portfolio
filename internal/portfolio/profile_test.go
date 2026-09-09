package portfolio

import "testing"

func TestProfileLoadsIdentityAndBiography(t *testing.T) {
	t.Parallel()

	if Profile.Identity.Name == "" {
		t.Error("Profile.Identity.Name is empty")
	}
	if Profile.SEO.Title == "" {
		t.Error("Profile.SEO.Title is empty")
	}
	if len(Profile.About.Paragraphs) == 0 {
		t.Error("Profile.About.Paragraphs is empty")
	}
	if Profile.Contact.Email == "" {
		t.Error("Profile.Contact.Email is empty")
	}
}
