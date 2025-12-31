import type { Route } from "./+types/home";
import Navbar from "~/components/Navbar";
import {resumes} from "../../constants";

import ResumeCard from "~/components/ResumeCards";
import {usePuterStore} from "~/lib/puter";
import {useLocation, useNavigate} from "react-router";
import {useEffect} from "react";


export function meta({}: Route.MetaArgs) {
    const {auth} = usePuterStore();

    const navigate=useNavigate();
    useEffect(()=>{
        if (!auth.isAuthenticated) navigate('/auth?next=/');

    },[auth.isAuthenticated])
  return [
    { title: "Resumate" },
    { name: "description", content: "Smart feedback for your dream job!" },
  ];
}

export default function Home() {
  return <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar/>
      <section className="main-section">
          <div className="page-heading">
              <h1>Track Applications & Resume Rating</h1>
              <h2>Review your submissions and check AI-powered feedback.</h2>

          </div>
          {resumes.length>0 && (

              <div className="resumes-section">
                  {resumes.map((resume) =>(
                      <ResumeCard key={resume.id} resume={resume}/>
                  ))
                  }

              </div>
          )}
      </section>








  </main>
}
