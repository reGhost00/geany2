cmake_minimum_required(VERSION 3.20)

project(geany VERSION 2.2.0 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
pkg_check_modules(GEANY_GTK REQUIRED IMPORTED_TARGET gtk4 gtksourceview-5)

add_executable(geany
	src/app.c
	src/main.c
)

target_link_libraries(geany PRIVATE PkgConfig::GEANY_GTK)

if (WIN32)
	set_target_properties(geany PROPERTIES WIN32_EXECUTABLE ON)
endif ()
