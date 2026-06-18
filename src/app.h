/*
 * app.h - GTK4 baseline application shell for the Geany migration.
 */

#ifndef GEANY_APP_H
#define GEANY_APP_H 1

#include <gtk/gtk.h>
#include <gtksourceview/gtksource.h>

G_BEGIN_DECLS

typedef struct GeanyApp
{
	GtkApplication *gtk_app;
	GtkApplicationWindow *window;
	GtkSourceBuffer *buffer;
	GtkWidget *view;
	GtkWidget *status_label;
	GtkWidget *cursor_label;
	GtkWidget *sidebar_name_label;
	GtkWidget *sidebar_path_label;
	GtkWidget *sidebar_state_label;
	GFile *current_file;
}
GeanyApp;

GeanyApp *app_new(void);
gint app_run(GeanyApp *app, gint argc, gchar **argv);
void app_free(GeanyApp *app);

G_END_DECLS

#endif /* GEANY_APP_H */
