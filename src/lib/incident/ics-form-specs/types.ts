export type IcsFormSpec = {
  title: string;
  subtitle: string;
  version: string;
  pages: IcsFormPageSpec[];
};

export type IcsFormPageSpec = {
  page: number;
  footerLabel: string;
  blocks: IcsFormBlockSpec[];
};

export type IcsFormBlockSpec =
  | { type: "incidentHeader" }
  | { type: "incidentNameNumber" }
  | { type: "incidentNameOnly" }
  | { type: "opPeriod" }
  | { type: "opPeriodOnly"; block?: string }
  | { type: "dateTimePrepared"; block?: string }
  | {
      type: "field";
      block: string;
      label: string;
      fieldId: string;
      input?: "text" | "date" | "time" | "datetime-local";
    }
  | {
      type: "textarea";
      block: string;
      label: string;
      fieldId: string;
      tall?: boolean;
      map?: boolean;
    }
  | {
      type: "row";
      fields: {
        block?: string;
        label: string;
        fieldId: string;
        input?: "text" | "date" | "time" | "datetime-local";
      }[];
    }
  | {
      type: "table";
      block: string;
      label?: string;
      fieldId: string;
      columns: string[];
      columnLabels: Record<string, string>;
      minRows: number;
    }
  | { type: "orgGrid"; block: string; label: string; positions: { id: string; label: string }[] }
  | { type: "yesNo"; block: string; label: string; yesId: string; noId: string }
  | {
      type: "checkboxes";
      block: string;
      label: string;
      items: { id: string; label: string }[];
      columns?: 1 | 2;
    }
  | { type: "preparedBy"; block?: string }
  | {
      type: "dualSignoff";
      block: string;
      primary: { role: string; nameId: string; sigId: string };
      secondary: { role: string; nameId: string; sigId: string };
    }
  | {
      type: "approval";
      block: string;
      label: string;
      nameId: string;
      sigId: string;
      dateId?: string;
    }
  | { type: "sectionTitle"; title: string }
  | { type: "hint"; text: string };
