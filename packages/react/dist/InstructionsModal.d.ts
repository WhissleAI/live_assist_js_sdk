declare function getStored(): string;
declare function setStored(value: string): void;
export declare function InstructionsModal({ isOpen, onClose, onSave, }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (instructions: string) => void;
}): any;
export { getStored as getStoredInstructions, setStored as setStoredInstructions };
//# sourceMappingURL=InstructionsModal.d.ts.map