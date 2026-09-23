export const CATEGORIES = [
  { id: "play", label: "Play", color: "#7b61ff" },
  { id: "arts", label: "Arts", color: "#ef476f" },
  { id: "music", label: "Music", color: "#118ab2" },
  { id: "food", label: "Food", color: "#f4a261" },
  { id: "outdoors", label: "Outdoors", color: "#2a9d8f" },
  { id: "tech", label: "Tech", color: "#3a86ff" },
  { id: "stories", label: "Stories", color: "#9b5de5" },
  { id: "style", label: "Style", color: "#f72585" },
  { id: "cozy", label: "Cozy", color: "#e07a5f" },
  { id: "collect", label: "Collect", color: "#f9c74f" },
];

export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id);
}
