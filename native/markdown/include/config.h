#ifndef CMARK_CONFIG_H
#define CMARK_CONFIG_H

#define HAVE_STDBOOL_H
#define HAVE___ATTRIBUTE__

#ifdef HAVE_STDBOOL_H
#include <stdbool.h>
#endif

#ifdef HAVE___ATTRIBUTE__
#define CMARK_ATTRIBUTE(list) __attribute__ (list)
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

#endif
