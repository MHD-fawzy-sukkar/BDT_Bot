from collections import deque

def bfs(start, is_goal, get_neighbors, to_key):
    q = deque([start])
    visited = {to_key(start)}

    while q:
        curr = q.popleft()

        if is_goal(curr):
            return curr

        for nxt in get_neighbors(curr):
            k = to_key(nxt)
            if k not in visited:
                visited.add(k)
                q.append(nxt)
    return None


def dfs(start, is_goal, get_neighbors, to_key):
    stack = [start]
    visited = {to_key(start)}

    while stack:
        curr = stack.pop()

        if is_goal(curr):
            return curr

        for nxt in get_neighbors(curr):
            k = to_key(nxt)
            if k not in visited:
                visited.add(k)
                stack.append(nxt)
    return None


def get_path(goal_node):
    path = []
    curr = goal_node
    while curr:
        path.append(curr)
        curr = curr.parent
    path.reverse()
    return path

# def get_neighbors(curr):
#     r, c = curr
#     R, C = len(grid), len(grid[0])
#     res = []
    
#     for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
#         nr, nc = r + dr, c + dc
#         if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] != '#':
#             res.append((nr, nc))
            
#     return res