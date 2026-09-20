"""Tests for the LRU Cache component (src/cache.py).

These tests verify the core LRU behaviour required for Phase 2:

correct insertion, retrieval, recency tracking, eviction, and
missing-key handling.
"""

import os
import sys

# Add the src/ directory to the import path so we can import cache.py.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from cache import LRUCache


# ---- Test 1: A new key/value can be inserted ----

def test_put_inserts_key():
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "What is an OS?"})

    assert 1 in cache.cache


# ---- Test 2: An inserted value can be retrieved ----

def test_get_returns_correct_value():
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "What is an OS?"})

    result = cache.get(1)

    assert result == {"question": "What is an OS?"}


# ---- Test 3: Retrieving an existing key updates its recency ----

def test_get_updates_recency():
    """
    Capacity = 3. Insert A, B, C. Then get(A).

    The LRU order becomes B, C, A.

    Inserting D should therefore evict B, not A.
    """
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "A"})
    cache.put(2, {"question": "B"})
    cache.put(3, {"question": "C"})

    # Access key 1 — makes it the most recently used.
    cache.get(1)

    # Insert a 4th item — should evict key 2.
    cache.put(4, {"question": "D"})

    assert cache.get(1) is not None, "Key 1 should still be in the cache"
    assert cache.get(2) is None, "Key 2 should have been evicted (LRU)"
    assert cache.get(3) is not None, "Key 3 should still be in the cache"
    assert cache.get(4) is not None, "Key 4 should still be in the cache"


# ---- Test 4: Updating an existing key works correctly ----

def test_update_existing_key():
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "Original"})
    cache.put(1, {"question": "Updated"})

    result = cache.get(1)

    assert result == {"question": "Updated"}, "Value should be updated"

    # Updating an existing key should not create a second entry.
    assert len(cache.cache) == 1


# ---- Test 5: Eviction at capacity 3 ----

def test_eviction_at_capacity_3():
    """Insert 4 items into a cache of capacity 3 → first item is evicted."""
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "A"})
    cache.put(2, {"question": "B"})
    cache.put(3, {"question": "C"})
    cache.put(4, {"question": "D"})

    assert cache.get(1) is None, "Key 1 should have been evicted"
    assert cache.get(2) is not None
    assert cache.get(3) is not None
    assert cache.get(4) is not None
    assert len(cache.cache) == 3


# ---- Test 6: Eviction at capacity 100 (assignment requirement) ----

def test_eviction_at_capacity_100():
    """
    Insert items 1–100 into a cache of capacity 100.
    Then insert item 101.

    Item 1, the least recently used item, must be evicted.
    """
    cache = LRUCache(capacity=100)

    # Insert 100 items (keys 1 through 100).
    for i in range(1, 101):
        cache.put(i, {"question": f"Q{i}"})

    assert len(cache.cache) == 100

    # Insert the 101st item.
    # Key 1 is the least recently used item and must be evicted.
    cache.put(101, {"question": "Q101"})

    assert cache.get(1) is None, "Key 1 must be evicted after 101st insertion"
    assert cache.get(101) is not None, "Key 101 should be in the cache"
    assert cache.get(50) is not None, "Key 50 should still be in the cache"
    assert len(cache.cache) == 100, "Cache size should remain at capacity"


# ---- Test 7: Accessing an older item changes which item gets evicted ----

def test_access_changes_eviction_target():
    """
    Capacity = 3. Insert A, B, C.

    Access A, making B the least recently used item.

    Insert D — B should be evicted, not A.
    """
    cache = LRUCache(capacity=3)

    cache.put(1, {"question": "A"})
    cache.put(2, {"question": "B"})
    cache.put(3, {"question": "C"})

    # Access key 1 — LRU order is now 2, 3, 1.
    cache.get(1)

    # Insert key 4 — evicts key 2.
    cache.put(4, {"question": "D"})

    assert cache.get(2) is None, "Key 2 should have been evicted"
    assert cache.get(1) is not None, "Key 1 should still be present"
    assert cache.get(3) is not None, "Key 3 should still be present"
    assert cache.get(4) is not None, "Key 4 should be present"


# ---- Test 8: Missing-key behavior ----

def test_missing_key_returns_none():
    cache = LRUCache(capacity=3)

    assert cache.get(999) is None, "Non-existent key should return None"

    cache.put(1, {"question": "A"})

    assert cache.get(2) is None, "Key 2 was never inserted"