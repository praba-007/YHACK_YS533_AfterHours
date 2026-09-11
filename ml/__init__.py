"""MachPulse ML package."""
import sys
import types

# Windows AppControl / WDAC defensive stub:
# Under strict WDAC policies, unused Cython DLLs in scipy.sparse.csgraph can be
# blocked from loading even when scikit-learn covariance/ensemble models do not
# use graph algorithms. This safe fallback allows scikit-learn to initialize.
try:
    import scipy.sparse.csgraph  # noqa: F401
except ImportError:
    _m = types.ModuleType("scipy.sparse.csgraph")
    _m.laplacian = lambda *a, **kw: None
    _m.minimum_spanning_tree = lambda *a, **kw: None
    _m._shortest_path = None
    _m._traversal = None
    sys.modules["scipy.sparse.csgraph"] = _m
