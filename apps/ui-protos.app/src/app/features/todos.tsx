import { ListTodo } from "lucide-react";
import { TodosView } from "../../notes-todos/todos-view.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature } from "../runtime.js";

export const todos: Feature = {
  id: "todos",
  label: "Todos",
  contribute: (rt) =>
    all(
      rt.slots.register(appViewsSlot, "todos", {
        id: "todos",
        title: "Todos",
        Icon: ListTodo,
        zone: "left",
        activity: 20,
        mobile: "tab",
        render: () => <TodosView />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(
          ShowPanel,
          { id: "todos" },
          { id: "view.todos", menu: "View", order: 20, label: "Todos", Icon: ListTodo },
        ),
      ),
    ),
};
