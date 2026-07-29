#pragma once

#define HAVE_STDBOOL_H 1

#include <stdbool.h>

#if defined(__clang__) || defined(__GNUC__)
#define HAVE___BUILTIN_EXPECT 1
#define HAVE___ATTRIBUTE__ 1
#define CMARK_ATTRIBUTE(list) __attribute__(list)
#else
#define CMARK_ATTRIBUTE(list)
#endif

#ifndef CMARK_INLINE
#if defined(_MSC_VER) && !defined(__cplusplus)
#define CMARK_INLINE __inline
#else
#define CMARK_INLINE inline
#endif
#endif
