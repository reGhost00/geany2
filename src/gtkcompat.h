/*
 *      gtkcompat.h - this file is part of Geany, a fast and lightweight IDE
 *
 *      Copyright 2012 The Geany contributors
 *
 *      This program is free software; you can redistribute it and/or modify
 *      it under the terms of the GNU General Public License as published by
 *      the Free Software Foundation; either version 2 of the License, or
 *      (at your option) any later version.
 *
 *      This program is distributed in the hope that it will be useful,
 *      but WITHOUT ANY WARRANTY; without even the implied warranty of
 *      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *      GNU General Public License for more details.
 *
 *      You should have received a copy of the GNU General Public License along
 *      with this program; if not, write to the Free Software Foundation, Inc.,
 *      51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

/* Compatibility macros to support GTK4 migration
 *
 * This file provides compatibility definitions for the GTK3 to GTK4 migration.
 * It is used by plugins, so it cannot be removed without care.
 */

#ifndef GTK_COMPAT_H
#define GTK_COMPAT_H 1

#include <gtk/gtk.h>

/* GTK4 compatibility macros */

/* In GTK4, widgets are visible by default, gtk_widget_show_all is removed */
#define gtk_widget_show_all(w) gtk_widget_set_visible(GTK_WIDGET(w), TRUE)

/* GtkContainer is removed in GTK4; provide shims for common patterns */
/* For gtk_container_add, callers should use the specific parent add method */

/* GdkColor is removed in GTK4; use GdkRGBA everywhere */
typedef GdkRGBA GdkColor;

/* gtk_widget_destroy is removed in GTK4 for non-windows */
static inline void compat_widget_destroy(GtkWidget *widget) {
    GtkWidget *parent = gtk_widget_get_parent(widget);
    if (parent) {
        if (GTK_IS_WINDOW(widget)) {
            gtk_window_destroy(GTK_WINDOW(widget));
        } else {
            gtk_widget_unparent(widget);
        }
    } else if (GTK_IS_WINDOW(widget)) {
        gtk_window_destroy(GTK_WINDOW(widget));
    }
}

#endif /* GTK_COMPAT_H */
