// TODO: temporary no-op stand-ins for the removed local range/tree modules.
// RangeEditor.vue and TreeEditor.vue are converted to rangeApi/treeApi next.

export class RangeManager {
  static new() {
    return new RangeManager();
  }
  raw_data() {
    return new Float32Array(1326);
  }
  to_string() {
    return "";
  }
  update(_row: number, _col: number, _weight: number) {}
  from_string(_text: string) {
    return "Range editing is not available yet";
  }
  get_weights() {
    return new Float32Array(169);
  }
  clear() {}
}

export class TreeManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static new(..._args: unknown[]) {
    return new TreeManager();
  }
  is_error() {
    return true;
  }
  added_lines() {
    return "";
  }
  removed_lines() {
    return "";
  }
  invalid_terminals() {
    return "";
  }
  back_to_root() {}
  play(_action: string) {
    return -1;
  }
  total_bet_amount() {
    return new Uint32Array(2);
  }
  is_terminal_node() {
    return true;
  }
  is_chance_node() {
    return false;
  }
  apply_history(_history: string) {}
  actions() {
    return "terminal";
  }
  add_bet_action(_amount: number, _isRaise: boolean) {}
  remove_current_node() {}
  delete_added_line(_line: string) {}
  delete_removed_line(_line: string) {}
}
