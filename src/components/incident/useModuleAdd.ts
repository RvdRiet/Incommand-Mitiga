"use client";

import { useIncidentStore } from "@/context/EventContext";

/** D4H-style primary action for the module toolbar + Add button */
export function useModuleAddHandler(moduleSlug: string) {
  const addRole = useIncidentStore((s) => s.addRole);
  const roleGroups = useIncidentStore((s) => s.roleGroups);
  const addTaskList = useIncidentStore((s) => s.addTaskList);
  const addDamage = useIncidentStore((s) => s.addDamage);
  const addResidentArea = useIncidentStore((s) => s.addResidentArea);
  const addResourceRequest = useIncidentStore((s) => s.addResourceRequest);
  const addRoadDamage = useIncidentStore((s) => s.addRoadDamage);
  const addShelter = useIncidentStore((s) => s.addShelter);
  const addUtilityRow = useIncidentStore((s) => s.addUtilityRow);
  const addPersonnel = useIncidentStore((s) => s.addPersonnel);
  const addLibraryItem = useIncidentStore((s) => s.addLibraryItem);
  const addMapAnnotation = useIncidentStore((s) => s.addMapAnnotation);
  const addCalendarEvent = useIncidentStore((s) => s.addCalendarEvent);
  const addStatusBoard = useIncidentStore((s) => s.addStatusBoard);
  const addStatusBoardItem = useIncidentStore((s) => s.addStatusBoardItem);
  const statusBoards = useIncidentStore((s) => s.statusBoards);
  const addContactGroup = useIncidentStore((s) => s.addContactGroup);

  return () => {
    switch (moduleSlug) {
      case "":
        break;
      case "roles":
        addRole(roleGroups[0]?.id ?? "");
        break;
      case "tasks":
        addTaskList();
        break;
      case "damage-assessment":
        addDamage();
        break;
      case "residents":
        addResidentArea();
        break;
      case "resource-requests":
        addResourceRequest();
        break;
      case "road-damages":
        addRoadDamage();
        break;
      case "shelters":
        addShelter();
        break;
      case "utilities-electricity":
        addUtilityRow();
        break;
      case "personnel":
        addPersonnel();
        break;
      case "library":
        addLibraryItem();
        break;
      case "map-annotations":
        addMapAnnotation();
        break;
      case "calendar": {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0);
        addCalendarEvent({
          startAt: start.toISOString().slice(0, 16),
          endAt: end.toISOString().slice(0, 16),
        });
        break;
      }
      case "forms":
        break;
      case "status-boards": {
        const board = statusBoards[0];
        if (board) {
          addStatusBoardItem(board.id, board.columns[0]?.id ?? "col-todo");
        } else {
          const id = addStatusBoard();
          addStatusBoardItem(id, "col-todo");
        }
        break;
      }
      case "notifications":
        addContactGroup();
        break;
      case "briefings":
      case "plays":
        break;
      default:
        break;
    }
  };
}
