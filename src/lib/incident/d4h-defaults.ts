import { newId } from "./id";
import type { ContactGroup, StatusBoard, StatusBoardColumn } from "./types";

export const DEFAULT_STATUS_COLUMNS: StatusBoardColumn[] = [
  { id: "col-backlog", title: "Backlog", color: "#64748b" },
  { id: "col-todo", title: "To do", color: "#0d9488" },
  { id: "col-progress", title: "In progress", color: "#0284c7" },
  { id: "col-blocked", title: "Blocked", color: "#e11d48" },
  { id: "col-done", title: "Done", color: "#16a34a" },
];

export function createDefaultStatusBoard(name = "Operations status"): StatusBoard {
  return {
    id: newId(),
    name,
    columns: DEFAULT_STATUS_COLUMNS.map((c) => ({ ...c })),
    items: [],
  };
}

export function createDefaultContactGroups(): ContactGroup[] {
  return [
    {
      id: newId(),
      name: "Command staff",
      description: "Incident command and section chiefs",
      members: "",
    },
    {
      id: newId(),
      name: "Field teams",
      description: "Operational and tactical responders",
      members: "",
    },
    {
      id: newId(),
      name: "Agency liaisons",
      description: "External agencies and mutual aid",
      members: "",
    },
  ];
}
