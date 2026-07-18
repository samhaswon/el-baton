#pragma once

#define HAVE_STDBOOL_H 1
#define HAVE___BUILTIN_EXPECT 1
#define HAVE___ATTRIBUTE__ 1

#include <stdbool.h>

#define CMARK_ATTRIBUTE(list) __attribute__(list)

#ifndef CMARK_INLINE
#define CMARK_INLINE inline
#endif

