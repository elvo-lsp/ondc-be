import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
    constructor(private readonly searchService: SearchService){}

    @Post()
    search(){
        
    }    
}
