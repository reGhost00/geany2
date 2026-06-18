/*
 * main.c - GTK4 baseline entry point for the Geany migration.
 */

#include "app.h"

int main(int argc, char **argv)
{
	GeanyApp *app;
	int status;

	app = app_new();
	status = app_run(app, argc, argv);
	app_free(app);

	return status;
}
