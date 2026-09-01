from collections import OrderedDict

class LRUCache:
    """
    An In-Memory Least Recently Used (LRU) Cache.
    This simulates OS page replacement by evicting the oldest questions when full.
    
    TODO (Member 3): 
    - Implement the get() method to fetch a question and mark it as recently used.
    - Implement the put() method to add a question, and evict the oldest if capacity is reached.
    """
    def __init__(self, capacity: int):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key: int):
        # Your code here
        pass

    def put(self, key: int, value: dict):
        # Your code here
        pass
