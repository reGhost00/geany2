/* Scintilla source code edit control */
/* ScintillaGTKAccessible.h - GTK4 accessibility stub for ScintillaGTK */
/* Copyright 2016 by Colomban Wendling <colomban@geany.org>
 * The License.txt file describes the conditions under which this software may be distributed. */

/* GTK4 uses a completely different accessibility model (GtkAccessible interface)
 * instead of ATK. This file is stubbed out for the GTK4 port. */

#ifndef SCINTILLAGTKACCESSIBLE_H
#define SCINTILLAGTKACCESSIBLE_H

namespace Scintilla::Internal {

class ScintillaGTKAccessible {
private:
	ScintillaGTK *sci;

public:
	ScintillaGTKAccessible(GtkAccessible *accessible_, GtkWidget *widget_);
	~ScintillaGTKAccessible();

	static ScintillaGTKAccessible *FromAccessible(GtkAccessible *accessible);
	void ChangeDocument(Document *oldDoc, Document *newDoc);
	void NotifyReadOnly();
	void SetAccessibility(bool enabled);
};

}

#endif
