/*
 * app.c - GTK4 baseline application shell for the Geany migration.
 */

#include "app.h"

#include <stdarg.h>
#include <string.h>

#define GEANY_APPLICATION_ID "org.geany.gtk4baseline"

static void app_init_plugins(GeanyApp *app);
static void app_init_ipc(GeanyApp *app);
static void app_init_editor(GeanyApp *app);
static void app_init_ui(GeanyApp *app);
static void app_init_ui_toolbar(GeanyApp *app, GtkWidget *parent);
static GtkWidget *app_init_ui_sidebar(GeanyApp *app);
static GtkWidget *app_init_ui_sidebar_files(GeanyApp *app);
static GtkWidget *app_init_ui_editor(GeanyApp *app);
static void app_init_ui_footbar(GeanyApp *app, GtkWidget *parent);
static void app_init_actions(GeanyApp *app);
static void app_ensure_window(GeanyApp *app);
static void app_reset_document(GeanyApp *app);
static void app_update_title(GeanyApp *app);
static void app_update_sidebar(GeanyApp *app);
static void app_update_cursor_status(GeanyApp *app);
static void app_set_status(GeanyApp *app, const gchar *format, ...);
static void app_present_error(GeanyApp *app, const gchar *primary, const gchar *secondary);
static gboolean app_load_file(GeanyApp *app, GFile *file);
static gboolean app_save_file(GeanyApp *app, GFile *file);


static void app_present_error(GeanyApp *app, const gchar *primary, const gchar *secondary)
{
	GtkAlertDialog *dialog;

	dialog = gtk_alert_dialog_new("%s", primary);
	gtk_alert_dialog_set_detail(dialog, secondary);
	gtk_alert_dialog_set_modal(dialog, TRUE);
	gtk_alert_dialog_show(dialog, GTK_WINDOW(app->window));
	g_object_unref(dialog);
}


static void app_set_status(GeanyApp *app, const gchar *format, ...)
{
	va_list args;
	gchar *message;

	if (app->status_label == NULL)
		return;

	va_start(args, format);
	message = g_strdup_vprintf(format, args);
	va_end(args);

	gtk_label_set_text(GTK_LABEL(app->status_label), message);
	g_free(message);
}


static void app_apply_language(GeanyApp *app, GFile *file, const gchar *contents, gsize length)
{
	GtkSourceLanguageManager *language_manager;
	GtkSourceLanguage *language;
	gchar *basename;
	gchar *content_type;

	if (file == NULL)
	{
		gtk_source_buffer_set_language(app->buffer, NULL);
		return;
	}

	language_manager = gtk_source_language_manager_get_default();
	basename = g_file_get_basename(file);
	content_type = g_content_type_guess(basename, (const guchar *) contents, length, NULL);
	language = gtk_source_language_manager_guess_language(language_manager, basename, content_type);
	gtk_source_buffer_set_language(app->buffer, language);

	g_free(content_type);
	g_free(basename);
}


static void app_set_current_file(GeanyApp *app, GFile *file, const gchar *contents, gsize length)
{
	if (app->current_file != NULL)
		g_object_unref(app->current_file);

	app->current_file = file != NULL ? g_object_ref(file) : NULL;
	app_apply_language(app, file, contents, length);
	app_update_title(app);
	app_update_sidebar(app);
	app_update_cursor_status(app);
}


static void app_on_modified_changed(GtkTextBuffer *buffer, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) buffer;

	app_update_title(app);
	app_update_sidebar(app);
}


static void app_on_cursor_position_changed(GObject *object, GParamSpec *pspec, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) object;
	(void) pspec;

	app_update_cursor_status(app);
}


static void app_update_title(GeanyApp *app)
{
	gboolean modified;
	gchar *basename;
	gchar *title;

	if (app->window == NULL)
		return;

	modified = gtk_text_buffer_get_modified(GTK_TEXT_BUFFER(app->buffer));
	basename = app->current_file != NULL ? g_file_get_basename(app->current_file) : g_strdup("Untitled");
	title = g_strdup_printf("%s%s - Geany GTK4 Baseline", modified ? "*" : "", basename);

	gtk_window_set_title(GTK_WINDOW(app->window), title);

	g_free(title);
	g_free(basename);
}


static void app_update_sidebar(GeanyApp *app)
{
	gboolean modified;
	gchar *basename;
	gchar *path;

	if (app->sidebar_name_label == NULL)
		return;

	modified = gtk_text_buffer_get_modified(GTK_TEXT_BUFFER(app->buffer));
	basename = app->current_file != NULL ? g_file_get_basename(app->current_file) : g_strdup("Untitled");
	path = app->current_file != NULL ? g_file_get_parse_name(app->current_file) :
		g_strdup("This document has not been saved yet.");

	gtk_label_set_text(GTK_LABEL(app->sidebar_name_label), basename);
	gtk_label_set_text(GTK_LABEL(app->sidebar_path_label), path);
	gtk_label_set_text(GTK_LABEL(app->sidebar_state_label), modified ? "Modified" : "Saved");

	g_free(path);
	g_free(basename);
}


static void app_update_cursor_status(GeanyApp *app)
{
	GtkTextIter iter;
	GtkTextMark *insert_mark;
	gint line;
	gint column;
	gchar *message;

	if (app->cursor_label == NULL)
		return;

	insert_mark = gtk_text_buffer_get_insert(GTK_TEXT_BUFFER(app->buffer));
	gtk_text_buffer_get_iter_at_mark(GTK_TEXT_BUFFER(app->buffer), &iter, insert_mark);

	line = gtk_text_iter_get_line(&iter) + 1;
	column = gtk_text_iter_get_line_offset(&iter) + 1;
	message = g_strdup_printf("Ln %d, Col %d", line, column);

	gtk_label_set_text(GTK_LABEL(app->cursor_label), message);
	g_free(message);
}


static void app_reset_document(GeanyApp *app)
{
	gtk_text_buffer_set_text(GTK_TEXT_BUFFER(app->buffer), "", 0);
	gtk_text_buffer_set_modified(GTK_TEXT_BUFFER(app->buffer), FALSE);
	app_set_current_file(app, NULL, NULL, 0);
	app_set_status(app, "Created a new document");
}


static gboolean app_load_file(GeanyApp *app, GFile *file)
{
	gchar *contents = NULL;
	gsize length = 0;
	GError *error = NULL;
	gchar *path;

	if (! g_file_load_contents(file, NULL, &contents, &length, NULL, &error))
	{
		gchar *file_path = g_file_get_parse_name(file);

		app_present_error(app, "Failed to open file", error->message);
		app_set_status(app, "Open failed: %s", file_path);

		g_free(file_path);
		g_error_free(error);
		return FALSE;
	}

	gtk_text_buffer_set_text(GTK_TEXT_BUFFER(app->buffer), contents, (gint) length);
	gtk_text_buffer_set_modified(GTK_TEXT_BUFFER(app->buffer), FALSE);
	app_set_current_file(app, file, contents, length);

	path = g_file_get_parse_name(file);
	app_set_status(app, "Opened %s", path);

	g_free(path);
	g_free(contents);
	return TRUE;
}


static gboolean app_save_file(GeanyApp *app, GFile *file)
{
	GtkTextIter start;
	GtkTextIter end;
	gchar *text;
	GError *error = NULL;
	gchar *path;
	gboolean result;

	gtk_text_buffer_get_bounds(GTK_TEXT_BUFFER(app->buffer), &start, &end);
	text = gtk_text_buffer_get_text(GTK_TEXT_BUFFER(app->buffer), &start, &end, FALSE);

	result = g_file_replace_contents(file, text, strlen(text), NULL, FALSE, G_FILE_CREATE_NONE,
		NULL, NULL, &error);
	if (! result)
	{
		gchar *file_path = g_file_get_parse_name(file);

		app_present_error(app, "Failed to save file", error->message);
		app_set_status(app, "Save failed: %s", file_path);

		g_free(file_path);
		g_error_free(error);
		g_free(text);
		return FALSE;
	}

	gtk_text_buffer_set_modified(GTK_TEXT_BUFFER(app->buffer), FALSE);
	app_set_current_file(app, file, text, strlen(text));

	path = g_file_get_parse_name(file);
	app_set_status(app, "Saved %s", path);

	g_free(path);
	g_free(text);
	return TRUE;
}


static void app_on_open_dialog_complete(GObject *source_object, GAsyncResult *result, gpointer user_data)
{
	GeanyApp *app = user_data;
	GtkFileDialog *dialog = GTK_FILE_DIALOG(source_object);
	GError *error = NULL;
	GFile *file;

	file = gtk_file_dialog_open_finish(dialog, result, &error);
	if (file == NULL)
	{
		if (error != NULL && ! g_error_matches(error, GTK_DIALOG_ERROR, GTK_DIALOG_ERROR_DISMISSED))
			app_present_error(app, "Failed to choose a file", error->message);
		g_clear_error(&error);
		g_object_unref(dialog);
		return;
	}

	app_load_file(app, file);
	g_object_unref(file);
	g_object_unref(dialog);
}


static void app_on_save_dialog_complete(GObject *source_object, GAsyncResult *result, gpointer user_data)
{
	GeanyApp *app = user_data;
	GtkFileDialog *dialog = GTK_FILE_DIALOG(source_object);
	GError *error = NULL;
	GFile *file;

	file = gtk_file_dialog_save_finish(dialog, result, &error);
	if (file == NULL)
	{
		if (error != NULL && ! g_error_matches(error, GTK_DIALOG_ERROR, GTK_DIALOG_ERROR_DISMISSED))
			app_present_error(app, "Failed to choose a save path", error->message);
		g_clear_error(&error);
		g_object_unref(dialog);
		return;
	}

	app_save_file(app, file);
	g_object_unref(file);
	g_object_unref(dialog);
}


static void app_action_new(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) action;
	(void) parameter;

	app_reset_document(app);
}


static void app_action_open(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;
	GtkFileDialog *dialog;

	(void) action;
	(void) parameter;

	dialog = gtk_file_dialog_new();
	gtk_file_dialog_set_title(dialog, "Open File");
	gtk_file_dialog_set_modal(dialog, TRUE);
	gtk_file_dialog_open(dialog, GTK_WINDOW(app->window), NULL, app_on_open_dialog_complete, app);
}


static void app_action_save_as(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;
	GtkFileDialog *dialog;

	(void) action;
	(void) parameter;

	dialog = gtk_file_dialog_new();
	gtk_file_dialog_set_title(dialog, "Save File");
	gtk_file_dialog_set_modal(dialog, TRUE);
	gtk_file_dialog_set_accept_label(dialog, "_Save");
	if (app->current_file != NULL)
		gtk_file_dialog_set_initial_file(dialog, app->current_file);
	else
		gtk_file_dialog_set_initial_name(dialog, "untitled.txt");
	gtk_file_dialog_save(dialog, GTK_WINDOW(app->window), NULL, app_on_save_dialog_complete, app);
}


static void app_action_save(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) action;
	(void) parameter;

	if (app->current_file != NULL)
	{
		app_save_file(app, app->current_file);
		return;
	}

	app_action_save_as(NULL, NULL, user_data);
}


static void app_action_quit(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) action;
	(void) parameter;

	g_application_quit(G_APPLICATION(app->gtk_app));
}


static void app_action_about(GSimpleAction *action, GVariant *parameter, gpointer user_data)
{
	GeanyApp *app = user_data;
	GtkWidget *dialog;

	(void) action;
	(void) parameter;

	dialog = gtk_about_dialog_new();
	gtk_about_dialog_set_program_name(GTK_ABOUT_DIALOG(dialog), "Geany GTK4 Baseline");
	gtk_about_dialog_set_version(GTK_ABOUT_DIALOG(dialog), "2.2.0-step1");
	gtk_about_dialog_set_comments(GTK_ABOUT_DIALOG(dialog),
		"Stage-1 GTK4 migration baseline with a GtkSourceView5 editor shell.");
	gtk_about_dialog_set_website(GTK_ABOUT_DIALOG(dialog), "https://github.com/reGhost00/geany2");
	gtk_window_set_transient_for(GTK_WINDOW(dialog), GTK_WINDOW(app->window));
	gtk_window_set_modal(GTK_WINDOW(dialog), TRUE);
	gtk_window_present(GTK_WINDOW(dialog));
}


static void app_init_actions(GeanyApp *app)
{
	static const GActionEntry actions[] =
	{
		{ .name = "new", .activate = app_action_new },
		{ .name = "open", .activate = app_action_open },
		{ .name = "save", .activate = app_action_save },
		{ .name = "save-as", .activate = app_action_save_as },
		{ .name = "quit", .activate = app_action_quit },
		{ .name = "about", .activate = app_action_about },
	};
	static const gchar *new_accels[] = { "<Primary>n", NULL };
	static const gchar *open_accels[] = { "<Primary>o", NULL };
	static const gchar *save_accels[] = { "<Primary>s", NULL };
	static const gchar *save_as_accels[] = { "<Primary><Shift>s", NULL };
	static const gchar *quit_accels[] = { "<Primary>q", NULL };

	g_action_map_add_action_entries(G_ACTION_MAP(app->gtk_app), actions, G_N_ELEMENTS(actions), app);
	gtk_application_set_accels_for_action(app->gtk_app, "app.new", new_accels);
	gtk_application_set_accels_for_action(app->gtk_app, "app.open", open_accels);
	gtk_application_set_accels_for_action(app->gtk_app, "app.save", save_accels);
	gtk_application_set_accels_for_action(app->gtk_app, "app.save-as", save_as_accels);
	gtk_application_set_accels_for_action(app->gtk_app, "app.quit", quit_accels);
}


static GtkWidget *app_create_toolbar_button(const gchar *icon_name, const gchar *tooltip,
	const gchar *action_name)
{
	GtkWidget *button;

	button = gtk_button_new_from_icon_name(icon_name);
	gtk_actionable_set_action_name(GTK_ACTIONABLE(button), action_name);
	gtk_widget_set_tooltip_text(button, tooltip);
	gtk_widget_add_css_class(button, "flat");

	return button;
}


static void app_init_ui_toolbar(GeanyApp *app, GtkWidget *parent)
{
	GtkWidget *toolbar;

	(void) app;

	toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
	gtk_widget_set_margin_top(toolbar, 6);
	gtk_widget_set_margin_bottom(toolbar, 6);
	gtk_widget_set_margin_start(toolbar, 6);
	gtk_widget_set_margin_end(toolbar, 6);

	gtk_box_append(GTK_BOX(toolbar),
		app_create_toolbar_button("document-new-symbolic", "Create a new file", "app.new"));
	gtk_box_append(GTK_BOX(toolbar),
		app_create_toolbar_button("document-open-symbolic", "Open a file", "app.open"));
	gtk_box_append(GTK_BOX(toolbar),
		app_create_toolbar_button("document-save-symbolic", "Save the current file", "app.save"));
	gtk_box_append(GTK_BOX(toolbar),
		app_create_toolbar_button("document-save-as-symbolic", "Save the current file as", "app.save-as"));

	gtk_box_append(GTK_BOX(parent), toolbar);
}


static GtkWidget *app_init_ui_sidebar_files(GeanyApp *app)
{
	GtkWidget *box;
	GtkWidget *title;

	box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);

	title = gtk_label_new("Current document");
	gtk_widget_add_css_class(title, "heading");
	gtk_label_set_xalign(GTK_LABEL(title), 0.0f);
	gtk_box_append(GTK_BOX(box), title);

	app->sidebar_name_label = gtk_label_new("Untitled");
	gtk_label_set_xalign(GTK_LABEL(app->sidebar_name_label), 0.0f);
	gtk_box_append(GTK_BOX(box), app->sidebar_name_label);

	app->sidebar_path_label = gtk_label_new("This document has not been saved yet.");
	gtk_label_set_xalign(GTK_LABEL(app->sidebar_path_label), 0.0f);
	gtk_label_set_wrap(GTK_LABEL(app->sidebar_path_label), TRUE);
	gtk_box_append(GTK_BOX(box), app->sidebar_path_label);

	app->sidebar_state_label = gtk_label_new("Saved");
	gtk_label_set_xalign(GTK_LABEL(app->sidebar_state_label), 0.0f);
	gtk_box_append(GTK_BOX(box), app->sidebar_state_label);

	return box;
}


static GtkWidget *app_init_ui_sidebar(GeanyApp *app)
{
	GtkWidget *sidebar;
	GtkWidget *files_panel;
	GtkWidget *phase_title;
	GtkWidget *phase_notes;

	sidebar = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
	gtk_widget_set_margin_top(sidebar, 12);
	gtk_widget_set_margin_bottom(sidebar, 12);
	gtk_widget_set_margin_start(sidebar, 12);
	gtk_widget_set_margin_end(sidebar, 12);
	gtk_widget_set_size_request(sidebar, 240, -1);

	files_panel = app_init_ui_sidebar_files(app);
	gtk_box_append(GTK_BOX(sidebar), files_panel);

	phase_title = gtk_label_new("Stage 1 scope");
	gtk_widget_add_css_class(phase_title, "heading");
	gtk_label_set_xalign(GTK_LABEL(phase_title), 0.0f);
	gtk_box_append(GTK_BOX(sidebar), phase_title);

	phase_notes = gtk_label_new(
		"GTK4 baseline keeps one editor surface with new/open/save support.\n"
		"Plugins, VTE, search, multi-document tabs and legacy GTK3 UI are deferred.");
	gtk_label_set_xalign(GTK_LABEL(phase_notes), 0.0f);
	gtk_label_set_wrap(GTK_LABEL(phase_notes), TRUE);
	gtk_box_append(GTK_BOX(sidebar), phase_notes);

	return sidebar;
}


static GtkWidget *app_init_ui_editor(GeanyApp *app)
{
	GtkWidget *scroller;

	app->view = gtk_source_view_new_with_buffer(app->buffer);
	gtk_text_view_set_monospace(GTK_TEXT_VIEW(app->view), TRUE);
	gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(app->view), GTK_WRAP_NONE);
	gtk_source_view_set_show_line_numbers(GTK_SOURCE_VIEW(app->view), TRUE);
	gtk_source_view_set_highlight_current_line(GTK_SOURCE_VIEW(app->view), TRUE);
	gtk_source_view_set_tab_width(GTK_SOURCE_VIEW(app->view), 4);
	gtk_widget_set_hexpand(app->view, TRUE);
	gtk_widget_set_vexpand(app->view, TRUE);

	scroller = gtk_scrolled_window_new();
	gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroller), app->view);
	gtk_widget_set_hexpand(scroller, TRUE);
	gtk_widget_set_vexpand(scroller, TRUE);

	return scroller;
}


static void app_init_ui_footbar(GeanyApp *app, GtkWidget *parent)
{
	GtkWidget *footbar;

	footbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 12);
	gtk_widget_set_margin_top(footbar, 6);
	gtk_widget_set_margin_bottom(footbar, 6);
	gtk_widget_set_margin_start(footbar, 12);
	gtk_widget_set_margin_end(footbar, 12);

	app->status_label = gtk_label_new("Ready");
	gtk_label_set_xalign(GTK_LABEL(app->status_label), 0.0f);
	gtk_widget_set_hexpand(app->status_label, TRUE);
	gtk_box_append(GTK_BOX(footbar), app->status_label);

	app->cursor_label = gtk_label_new("Ln 1, Col 1");
	gtk_label_set_xalign(GTK_LABEL(app->cursor_label), 1.0f);
	gtk_box_append(GTK_BOX(footbar), app->cursor_label);

	gtk_box_append(GTK_BOX(parent), footbar);
}


static GtkWidget *app_create_menubar(void)
{
	GMenu *menubar;
	GMenu *file_menu;
	GMenu *help_menu;
	GtkWidget *widget;

	menubar = g_menu_new();
	file_menu = g_menu_new();
	help_menu = g_menu_new();

	g_menu_append(file_menu, "New", "app.new");
	g_menu_append(file_menu, "Open", "app.open");
	g_menu_append(file_menu, "Save", "app.save");
	g_menu_append(file_menu, "Save As", "app.save-as");
	g_menu_append(file_menu, "Quit", "app.quit");
	g_menu_append_submenu(menubar, "File", G_MENU_MODEL(file_menu));

	g_menu_append(help_menu, "About", "app.about");
	g_menu_append_submenu(menubar, "Help", G_MENU_MODEL(help_menu));

	widget = gtk_popover_menu_bar_new_from_model(G_MENU_MODEL(menubar));

	g_object_unref(help_menu);
	g_object_unref(file_menu);
	g_object_unref(menubar);

	return widget;
}


static void app_init_ui(GeanyApp *app)
{
	GtkWidget *root;
	GtkWidget *content;
	GtkWidget *sidebar;
	GtkWidget *editor;
	GtkWidget *menubar;

	app_init_actions(app);

	app->window = GTK_APPLICATION_WINDOW(gtk_application_window_new(app->gtk_app));
	gtk_window_set_default_size(GTK_WINDOW(app->window), 1280, 800);

	root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
	gtk_window_set_child(GTK_WINDOW(app->window), root);

	menubar = app_create_menubar();
	gtk_box_append(GTK_BOX(root), menubar);

	app_init_ui_toolbar(app, root);

	content = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
	gtk_widget_set_vexpand(content, TRUE);

	sidebar = app_init_ui_sidebar(app);
	editor = app_init_ui_editor(app);
	gtk_paned_set_position(GTK_PANED(content), 260);
	gtk_paned_set_start_child(GTK_PANED(content), sidebar);
	gtk_paned_set_end_child(GTK_PANED(content), editor);
	gtk_box_append(GTK_BOX(root), content);

	app_init_ui_footbar(app, root);
	app_update_title(app);
	app_update_sidebar(app);
	app_update_cursor_status(app);
}


static void app_ensure_window(GeanyApp *app)
{
	if (app->window == NULL)
		app_init_ui(app);
}


static void app_on_activate(GtkApplication *gtk_app, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) gtk_app;

	app_ensure_window(app);
	gtk_window_present(GTK_WINDOW(app->window));
}


static void app_on_open(GApplication *gapp, GFile **files, gint n_files,
	const gchar *hint, gpointer user_data)
{
	GeanyApp *app = user_data;

	(void) gapp;
	(void) hint;

	app_ensure_window(app);
	if (n_files > 0)
	{
		app_load_file(app, files[0]);
		if (n_files > 1)
			app_set_status(app, "Opened first file; %d additional files are deferred to a later phase",
				n_files - 1);
	}
	gtk_window_present(GTK_WINDOW(app->window));
}


static void app_init_plugins(GeanyApp *app)
{
	(void) app;

	/*
	 * Stage 1 keeps plugin loading disabled.
	 *
	 * Planned direction:
	 * - Each plugin will be a GModule exposing init_plugin().
	 * - init_plugin() will return a versioned function table rather than linking
	 *   against mutable global structures.
	 * - Core services such as document access, action registration and message
	 *   reporting will be passed through explicit callback tables so that editor
	 *   backend changes do not leak through ABI-sensitive structs.
	 */
}


static void app_init_ipc(GeanyApp *app)
{
	(void) app;

	/*
	 * GtkApplication already provides a usable single-instance baseline for
	 * Stage 1. Dedicated socket or remote-open compatibility can be layered on
	 * top in a later phase if Geany-specific IPC semantics are still required.
	 */
}


static void app_init_editor(GeanyApp *app)
{
	GtkSourceStyleSchemeManager *scheme_manager;
	GtkSourceStyleScheme *scheme;

	app->buffer = gtk_source_buffer_new(NULL);
	gtk_source_buffer_set_highlight_syntax(app->buffer, TRUE);
	gtk_source_buffer_set_highlight_matching_brackets(app->buffer, TRUE);

	scheme_manager = gtk_source_style_scheme_manager_get_default();
	scheme = gtk_source_style_scheme_manager_get_scheme(scheme_manager, "Adwaita");
	if (scheme == NULL)
		scheme = gtk_source_style_scheme_manager_get_scheme(scheme_manager, "classic");
	if (scheme != NULL)
		gtk_source_buffer_set_style_scheme(app->buffer, scheme);

	g_signal_connect(app->buffer, "modified-changed", G_CALLBACK(app_on_modified_changed), app);
	g_signal_connect(app->buffer, "notify::cursor-position",
		G_CALLBACK(app_on_cursor_position_changed), app);
}


GeanyApp *app_new(void)
{
	GeanyApp *app;

	app = g_new0(GeanyApp, 1);
	app->gtk_app = gtk_application_new(GEANY_APPLICATION_ID, G_APPLICATION_HANDLES_OPEN);

	app_init_plugins(app);
	app_init_ipc(app);
	app_init_editor(app);

	g_signal_connect(app->gtk_app, "activate", G_CALLBACK(app_on_activate), app);
	g_signal_connect(app->gtk_app, "open", G_CALLBACK(app_on_open), app);

	return app;
}


gint app_run(GeanyApp *app, gint argc, gchar **argv)
{
	return g_application_run(G_APPLICATION(app->gtk_app), argc, argv);
}


void app_free(GeanyApp *app)
{
	if (app == NULL)
		return;

	if (app->current_file != NULL)
		g_object_unref(app->current_file);
	if (app->buffer != NULL)
		g_object_unref(app->buffer);
	if (app->gtk_app != NULL)
		g_object_unref(app->gtk_app);

	g_free(app);
}
