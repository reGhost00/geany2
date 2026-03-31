/* Scintilla source code edit control */
/* ScintillaGTKAccessible.cxx - GTK4 accessibility stub for ScintillaGTK */
/* Copyright 2016 by Colomban Wendling <colomban@geany.org>
 * The License.txt file describes the conditions under which this software may be distributed. */

/* GTK4 uses a completely different accessibility model (GtkAccessible interface)
 * instead of ATK. This file provides minimal stubs for the GTK4 port.
 * Full GTK4 accessibility support should be implemented using GtkAccessible. */

#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>
#include <map>
#include <algorithm>
#include <memory>
#include <optional>

#include <glib.h>
#include <gtk/gtk.h>

#include "ScintillaTypes.h"
#include "ScintillaMessages.h"
#include "ScintillaStructures.h"
#include "ILexer.h"
#include "Debugging.h"
#include "Geometry.h"
#include "Platform.h"
#include "Scintilla.h"
#include "ScintillaWidget.h"
#include "CharacterCategoryMap.h"
#include "Position.h"
#include "UniqueString.h"
#include "SplitVector.h"
#include "Partitioning.h"
#include "RunStyles.h"
#include "ContractionState.h"
#include "CellBuffer.h"
#include "CallTip.h"
#include "KeyMap.h"
#include "Indicator.h"
#include "LineMarker.h"
#include "Style.h"
#include "ViewStyle.h"
#include "CharClassify.h"
#include "Decoration.h"
#include "CaseFolder.h"
#include "Document.h"
#include "CaseConvert.h"
#include "UniConversion.h"
#include "Selection.h"
#include "PositionCache.h"
#include "EditModel.h"
#include "MarginView.h"
#include "EditView.h"
#include "Editor.h"
#include "AutoComplete.h"
#include "ScintillaBase.h"
#include "ScintillaGTK.h"
#include "ScintillaGTKAccessible.h"

using namespace Scintilla;
using namespace Scintilla::Internal;

ScintillaGTKAccessible::ScintillaGTKAccessible(
GtkAccessible *accessible_, GtkWidget *widget_) :
sci(ScintillaGTK::FromWidget(widget_)) {
// GTK4 accessibility is handled by GtkAccessible interface
// This is a stub - full implementation would use gtk_accessible_update_*
}

ScintillaGTKAccessible::~ScintillaGTKAccessible() {
}

ScintillaGTKAccessible *ScintillaGTKAccessible::FromAccessible(GtkAccessible *accessible) {
// Stub - GTK4 accessibility model is different
return nullptr;
}

void ScintillaGTKAccessible::ChangeDocument(Document *oldDoc, Document *newDoc) {
// Stub for GTK4
}

void ScintillaGTKAccessible::NotifyReadOnly() {
// Stub for GTK4
}

void ScintillaGTKAccessible::SetAccessibility(bool enabled) {
// Stub for GTK4
}
