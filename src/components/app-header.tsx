import {useTheme} from "next-themes";
import {Bell, Plus, Search, UserRound} from "lucide-react";
import {AiIcon} from "../../public";
import Image from "next/image";
const AppHeader = () => {
    const {theme, setTheme} = useTheme()
    console.log(theme);
    return (
        <div className="w-dvw flex items-center justify-between px-8 py-3 bg-background">
            <div className="max-w-[384px] w-full bg-surface-elevated rounded-lg p-0.75 text-sm flex items-center justify-between gap-2.5 border border-border">
                <Search size={18}/>
                <input className="w-full outline-none" type="search" placeholder="Search"/>
                <div className="bg-surface rounded-lg p-1">
                    <p className="whitespace-nowrap text-sm">
                        Ctrl K
                    </p>
                </div>
            </div>
            <div className="flex items-center justify-center gap-4">
                <div className="text-surface bg-accent px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5">
                    <span>
                        <Image src={AiIcon} alt={"Ai Icon"} width={24} height={24}/>
                    </span>
                    Ask AI
                </div>
                <div className="flex items-center justify-center gap-4">
                    <div className="flex relative">
                            <Bell/>
                        <div className="bg-background absolute p-0.5 rounded-full top-0 right-0 z-999">
                            <div className="p-1 rounded-full bg-error"></div>
                        </div>
                    </div>
                    <div className="p-0.5 rounded-full bg-surface-elevated border border-border">
                        <button className={`px-2 py-0.5 ${theme === "dark" ? "bg-surface text-text-primary" : "bg-transparent text-text-muted"} rounded-full`} onClick={() => setTheme("dark")}>Dark</button>
                        <button className={`px-2 py-0.5 ${theme === "system" ? "bg-surface text-text-primary" : "bg-transparent text-text-muted"} rounded-full`}  onClick={() => setTheme("system")}>System</button>
                        <button className={`px-2 py-0.5 ${theme === "light" ? "bg-surface text-text-primary" : "bg-transparent text-text-muted"} rounded-full`}  onClick={() => setTheme("light")}>Light</button>
                    </div>
                </div>
                <div className="text-surface flex items-center justify-center gap-1.5 bg-primary px-4 py-2.5 rounded-lg hover:bg-primary-hover">
                    <span>
                        <Plus size={16} strokeWidth={1.5}/>
                    </span>
                    New Task
                </div>
                <div className="bg-primary p-1.5 rounded-full pointer relative">
                    <div className="text-surface">
                        <UserRound size={18} strokeWidth={1.5}/>
                    </div>
                    <div className="absolute rounded-full p-1 bg-background z-9999 bottom-0 right-0">
                        <div className="p-1 rounded-full bg-primary"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppHeader;