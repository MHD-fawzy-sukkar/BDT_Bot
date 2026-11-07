class State:
    def __init__(self, r, c, board, cost=0, parent=None):
        self.r = r
        self.c = c
        self.board = [row[:] for row in board]
        self.cost = cost
        self.parent = parent

    def print_state(self):
        for row in self.board:
            print(" ".join(row))

GRID = [
    ['S', '0', '#', '0', '0'],
    ['0', '0', '#', '0', '#'],
    ['#', '0', '0', '0', '0'],
    ['0', '#', '#', '#', '0'],
    ['0', '0', '0', '0', 'G']
]

WALL = '#'
EMPTY = '0'
PLAYER = 'P'
GOAL = 'G'
START = 'S'

def initial(grid):
    rows, cols = len(grid), len(grid[0])
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == START:
                init_state = State(r, c, grid, 0, None)
                init_state.board[r][c] = PLAYER
                return init_state
    return None

def is_goal(grid, r, c):
    return grid[r][c] == GOAL

def is_valid(grid, r, c):
    rows, cols = len(grid), len(grid[0])
    return 0 <= r < rows and 0 <= c < cols and grid[r][c] != WALL

def actions(grid, r, c):
    moves = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    valid_actions = []
    for dr, dc in moves:
        nr, nc = r + dr, c + dc
        if is_valid(grid, nr, nc):
            valid_actions.append((dr, dc))
    return valid_actions

def transition(state, action):
    dr, dc = action
    nr, nc = state.r + dr, state.c + dc
    new_cost = cost(state.cost, action)
    new_state = State(nr, nc, state.board, new_cost, state)
    new_state.board[state.r][state.c] = EMPTY
    new_state.board[nr][nc] = PLAYER
    return new_state

def cost(curr_cost, action):
    return curr_cost + 1

if __name__ == "__main__":
    print("Hello World")
